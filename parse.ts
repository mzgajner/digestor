import { Html5Entities } from 'https://deno.land/x/html_entities/mod.js'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import { convertBytesToSeconds, getLastName } from './utils.ts'
import { SPOTIFY_BLACKLIST } from './fetch.ts'

const BASE_URL = 'https://radiostudent.si'

// How many episode pages to fetch at once. The archive is over a hundred
// episodes deep, so we throttle to avoid hammering the source (and getting
// rate limited).
const CONCURRENCY = 8

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

export async function parseEntries(episodeUrls: string[]) {
  const transformed = await mapWithConcurrency(
    episodeUrls,
    CONCURRENCY,
    transformEntry,
  )

  return transformed
    .filter((entry): entry is ParsedEntry => entry !== null)
    .filter((entry) => !SPOTIFY_BLACKLIST.includes(entry.title))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
}

async function transformEntry(url: string): Promise<ParsedEntry | null> {
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

    // Episodes that can't be fully resolved (missing audio or date) are
    // skipped rather than breaking the whole run.
    if (!mp3Path || !date) return null

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
    console.warn(`Skipping ${url}: ${message}`)
    return null
  }
}

async function fetchHtml(url: string) {
  const response = await fetch(url)
  const html = await response.text()
  return html
}

async function fetchContentLength(mp3Url: string) {
  const response = await fetch(mp3Url, { method: 'HEAD' })
  const contentLength = response.headers.get('content-length')!
  return Number(contentLength)
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
