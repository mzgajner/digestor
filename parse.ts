import { Html5Entities } from 'https://deno.land/x/html_entities/mod.js'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import {
  convertBytesToSeconds,
  type FetchFn,
  getLastName,
  USER_AGENT,
} from './utils.ts'
import { SPOTIFY_BLACKLIST } from './fetch.ts'

const BASE_URL = 'https://radiostudent.si'

// How many episode pages to fetch at once. The archive is over a hundred
// episodes deep, so we throttle to avoid hammering the source (and getting
// rate limited).
const CONCURRENCY = 8

// The source occasionally returns an incomplete page (a 200 that's missing
// the audio/date fields), so we retry a few times before giving up.
const MAX_ATTEMPTS = 3

export type ParsedEntry = {
  imageUrl: string
  authors: string[]
  description: string | undefined
  subtitle: string | undefined
  date: Date
  enclosure: { url: string; size: number }
  duration: number
  url: string
  guid: string
  title: string
}

type ParseOptions = {
  // Entries already present in the feed, keyed by episode URL.
  existing?: Map<string, ParsedEntry>
  // Re-fetch every episode instead of reusing the ones we already have.
  full?: boolean
}

export async function parseEntries(
  episodeUrls: string[],
  { existing = new Map(), full = false }: ParseOptions = {},
) {
  const resolved = await mapWithConcurrency(
    episodeUrls,
    CONCURRENCY,
    async (url) => {
      // In incremental mode we reuse whatever we already have without hitting
      // the network at all.
      if (!full && existing.has(url)) return existing.get(url)!

      // Otherwise fetch it fresh, but fall back to the existing entry (if any)
      // so a flaky fetch never drops an episode we already had.
      return (await transformEntry(url)) ?? existing.get(url) ?? null
    },
  )

  const byUrl = new Map<string, ParsedEntry>()
  for (const entry of resolved) if (entry) byUrl.set(entry.url, entry)
  // Keep any existing episodes that fell off the listing entirely.
  for (const [url, entry] of existing) {
    if (!byUrl.has(url)) byUrl.set(url, entry)
  }

  return [...byUrl.values()]
    .filter((entry) => !SPOTIFY_BLACKLIST.includes(entry.title))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

async function transformEntry(url: string): Promise<ParsedEntry | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const postHtml = await fetchHtml(url)
      const {
        imageUrl,
        authors,
        description,
        subtitle,
        date,
        mp3Path,
        duration,
        guid,
        title,
      } = parseValuesFromPostHtml(postHtml)

      // A page missing its audio or date is treated as a transient failure
      // and retried rather than silently dropping the episode.
      if (!mp3Path || !date) throw new Error('missing audio or date')

      const enclosureUrl = `${BASE_URL}${mp3Path}`
      const contentLength = await fetchContentLength(enclosureUrl)

      return {
        imageUrl,
        authors,
        description,
        subtitle,
        date,
        enclosure: {
          url: enclosureUrl,
          size: contentLength,
        },
        duration: duration ?? convertBytesToSeconds(contentLength),
        url,
        guid,
        title,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === MAX_ATTEMPTS) {
        console.warn(`Giving up on ${url}: ${message}`)
        return null
      }
    }
  }

  return null
}

async function fetchHtml(url: string) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`HTTP ${response.status}`)
  }
  return await response.text()
}

// Throws rather than returning 0: an entry is only ever fetched once, so a
// bogus size would otherwise stay in the feed forever.
export async function fetchContentLength(
  mp3Url: string,
  fetchFn: FetchFn = fetch,
) {
  const response = await fetchFn(mp3Url, {
    method: 'HEAD',
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${mp3Url}`)
  const contentLength = Number(response.headers.get('content-length'))
  if (!contentLength) throw new Error(`no content length for ${mp3Url}`)
  return contentLength
}

export function parseValuesFromPostHtml(postHtml: string) {
  const decodedHtml = Html5Entities.decode(postHtml)
  const document = new DOMParser().parseFromString(decodedHtml, 'text/html')
  const node = document!.querySelector('.node')!

  // Image URL
  const imageUrl = node
    ?.querySelector('.field--name-field-slika-media a')
    ?.getAttribute('href') ?? ''

  // List of all author names
  const mainAuthorElement = node?.querySelector('.field--name-uid a')
  // The markup for this field varies across the archive (a `field__items`
  // container with inner items on older posts, combined classes on newer
  // ones), so we just grab every author link inside it.
  const additionalAuthorElements = node?.querySelectorAll(
    '.field--name-field-dodatni-avtorji a',
  )!
  const allAuthorElements = [mainAuthorElement, ...additionalAuthorElements]
  const authors = allAuthorElements
    .map((element) => element?.textContent ?? '')
    .filter(Boolean)
    .sort((a, b) => getLastName(a).localeCompare(getLastName(b)))

  // Description text from the actual post body
  const description = node?.querySelector(
    '.field--name-body.field__item',
  )?.innerHTML

  // Short teaser shown as the iTunes summary/subtitle
  const subtitle = node
    ?.querySelector('.field--name-field-podnaslov')
    ?.textContent
    ?.trim() || undefined

  // Broadcast date (e.g. "30. 11. 2015 – 23.00")
  const date = parseSlovenianDate(
    node?.querySelector('.field--name-field-v-etru')?.textContent ?? '',
  )

  // Audio file: URL, title and duration all live on the <audio-file> element
  const audioFile = node?.querySelector('audio-file')
  const mp3Path = audioFile?.querySelector('a')?.getAttribute('href') ?? ''
  const title = audioFile?.getAttribute('node-title')?.trim() ?? ''
  const trajanje = audioFile?.getAttribute('trajanje')
  const duration = trajanje ? Number(trajanje) : undefined

  // Node ID to use as guid
  const commentFormElement = node.querySelector(
    '.node .comment-comment-node-prispevek-form',
  )!
  const guid = commentFormElement.getAttribute('action')!.match(/\d+/)![0]

  return {
    imageUrl,
    authors,
    description,
    subtitle,
    date,
    mp3Path,
    duration,
    guid,
    title,
  }
}

// Parses a Slovenian broadcast date like "30. 11. 2015 – 23.00" into a Date,
// anchoring it to Ljubljana's timezone so the produced instant is stable
// regardless of where the generator runs.
function parseSlovenianDate(text: string): Date | null {
  const match = text.match(
    /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:\s*[–-]\s*(\d{1,2})\.(\d{2}))?/,
  )
  if (!match) return null

  const [, day, month, year, hour = '0', minute = '0'] = match
  const pad = (value: string) => value.padStart(2, '0')
  const offset = ljubljanaOffset(Number(year), Number(month), Number(day))

  return new Date(
    `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`,
  )
}

// Central European (Slovenian) UTC offset: +02:00 during summer time, which
// runs from the last Sunday of March to the last Sunday of October, +01:00
// otherwise.
function ljubljanaOffset(year: number, month: number, day: number) {
  const dstStart = lastSundayOfMonth(year, 3)
  const dstEnd = lastSundayOfMonth(year, 10)
  const isSummerTime = (month > 3 || (month === 3 && day >= dstStart)) &&
    (month < 10 || (month === 10 && day < dstEnd))

  return isSummerTime ? '+02:00' : '+01:00'
}

function lastSundayOfMonth(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month, 0))
  return lastDay.getUTCDate() - lastDay.getUTCDay()
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit)
    results.push(...await Promise.all(batch.map(fn)))
  }
  return results
}
