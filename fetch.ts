import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import {
  type BackoffOptions,
  type FetchFn,
  fetchWithBackoff,
  sleep,
  USER_AGENT,
} from './utils.ts'

export { USER_AGENT }

const BASE_URL = 'https://radiostudent.si'
const SECTION_PATH = '/kultura/pritiskavec-gold'
const SECTION_URL = `${BASE_URL}${SECTION_PATH}`

// Spotify complained these contain copyrighted material, so we're excluding
// them from the feed to avoid any issues. Matched against episode titles in
// parse.ts.
export const SPOTIFY_BLACKLIST = [
  'Skupaj je lažje',
  'Mrknil je Telltale',
  'Portal',
  'Jagodni izbor sezone 2017/18',
  'Iz Rusije z ljubeznijo',
  'Slišati igro',
]

// The same episodes by URL slug, so they are dropped before their pages are
// ever fetched (they never make it into the feed, so every run would
// otherwise re-fetch them as "new"). Kept in step with the titles by a test.
export const BLACKLISTED_SLUGS = new Set([
  'skupaj-je-lazje',
  'mrknil-je-telltale',
  'portal',
  'jagodni-izbor-sezone-2017-18',
  'iz-rusije-z-ljubeznijo',
  'slisati-igro',
])

export type FetchOptions = BackoffOptions & {
  // Pause between listing pages. The source sits behind an anti-bot proxy
  // that answers bursts from datacenter addresses with 418, and this runs
  // once a day, so there is no reason to hurry.
  pageDelayMs?: number
}

// Walks the paginated section listing and returns the absolute URL of every
// episode, newest first. The RSS feed only ever returns the latest 40 items
// (its `?page=` parameter is ignored), but the HTML listing paginates all the
// way back to the very first episode, so we scrape that instead.
//
// Throws when the site answers with an error or a page without any episode
// links (which is what an anti-bot challenge looks like), so an unattended run
// fails loudly instead of concluding there is nothing new.
export default async function fetchEpisodeUrls(
  fetchFn: FetchFn = fetch,
  { pageDelayMs = 1000, sleep: pause = sleep, ...backoff }: FetchOptions = {},
) {
  const urls: string[] = []
  const seen = new Set<string>()
  let page = 0

  while (true) {
    if (page > 0) await pause(pageDelayMs)
    const pageUrls = await fetchEpisodeUrlsForPage(page, {
      ...backoff,
      fetchFn,
      sleep: pause,
    })
    const newUrls = pageUrls.filter((url) => !seen.has(url))

    // No new episodes means we've reached the end (or pagination broke), so
    // we stop instead of looping forever.
    if (newUrls.length === 0) break

    newUrls.forEach((url) => {
      seen.add(url)
      urls.push(url)
    })
    page++
  }

  if (urls.length === 0) {
    throw new Error(
      'Listing returned no episode URLs (blocked, or the markup changed).',
    )
  }
  return urls
}

async function fetchEpisodeUrlsForPage(page: number, backoff: BackoffOptions) {
  let response: Response
  try {
    response = await fetchWithBackoff(
      `${SECTION_URL}?page=${page}`,
      {},
      backoff,
    )
  } catch (error) {
    const status = error instanceof Error
      ? error.message.match(/HTTP \d+/)
      : null
    if (!status) throw error
    throw new Error(`Listing page ${page} returned ${status[0]}.`)
  }
  const html = await response.text()
  const document = new DOMParser().parseFromString(html, 'text/html')!

  const paths = [...document.querySelectorAll('a[href]')]
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter(isEpisodePath)

  return [...new Set(paths)].map((path) => `${BASE_URL}${path}`)
}

// Matches an episode path (/kultura/pritiskavec-gold/<slug>) while excluding
// the section root, the /podcast feed, blacklisted episodes and deeper paths.
function isEpisodePath(href: string) {
  const match = href.match(/^\/kultura\/pritiskavec-gold\/([a-z0-9-]+)$/)
  return Boolean(match) && match![1] !== 'podcast' &&
    !BLACKLISTED_SLUGS.has(match![1])
}
