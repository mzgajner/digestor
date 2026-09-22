import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import { type FetchFn, USER_AGENT } from './utils.ts'

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

// Walks the paginated section listing and returns the absolute URL of every
// episode, newest first. The RSS feed only ever returns the latest 40 items
// (its `?page=` parameter is ignored), but the HTML listing paginates all the
// way back to the very first episode, so we scrape that instead.
//
// Throws when the site answers with an error or a page without any episode
// links (which is what an anti-bot challenge looks like), so an unattended run
// fails loudly instead of concluding there is nothing new.
export default async function fetchEpisodeUrls(fetchFn: FetchFn = fetch) {
  const urls: string[] = []
  const seen = new Set<string>()
  let page = 0

  while (true) {
    const pageUrls = await fetchEpisodeUrlsForPage(page, fetchFn)
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

async function fetchEpisodeUrlsForPage(page: number, fetchFn: FetchFn) {
  const response = await fetchFn(`${SECTION_URL}?page=${page}`, {
    headers: { 'User-Agent': USER_AGENT },
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Listing page ${page} returned HTTP ${response.status}.`)
  }
  const html = await response.text()
  const document = new DOMParser().parseFromString(html, 'text/html')!

  const paths = [...document.querySelectorAll('a[href]')]
    .map((anchor) => anchor.getAttribute('href') ?? '')
    .filter(isEpisodePath)

  return [...new Set(paths)].map((path) => `${BASE_URL}${path}`)
}

// Matches an episode path (/kultura/pritiskavec-gold/<slug>) while excluding
// the section root, the /podcast feed and any deeper paths.
function isEpisodePath(href: string) {
  const match = href.match(/^\/kultura\/pritiskavec-gold\/([a-z0-9-]+)$/)
  return Boolean(match) && match![1] !== 'podcast'
}
