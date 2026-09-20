import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import fetchEpisodeUrls, { USER_AGENT } from './fetch.ts'

function listing(slugs: string[]) {
  const links = slugs
    .map((slug) => `<a href="/kultura/pritiskavec-gold/${slug}">x</a>`)
    .join('')
  return `<html><body>${links}<a href="/kultura/pritiskavec-gold/podcast">feed</a></body></html>`
}

// Serves the given pages by ?page= index and an empty listing after that.
function fakeFetch(pages: string[], status = 200) {
  const requests: Request[] = []
  const fetchFn = (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    const page = Number(new URL(request.url).searchParams.get('page'))
    return Promise.resolve(new Response(pages[page] ?? listing([]), { status }))
  }
  return { fetchFn, requests }
}

Deno.test(async function fetchEpisodeUrlsWalksPagesTest() {
  const { fetchFn } = fakeFetch([listing(['b', 'a']), listing(['a', 'c'])])
  assertEquals(await fetchEpisodeUrls(fetchFn), [
    'https://radiostudent.si/kultura/pritiskavec-gold/b',
    'https://radiostudent.si/kultura/pritiskavec-gold/a',
    'https://radiostudent.si/kultura/pritiskavec-gold/c',
  ])
})

Deno.test(async function fetchEpisodeUrlsIdentifiesItselfTest() {
  const { fetchFn, requests } = fakeFetch([listing(['a'])])
  await fetchEpisodeUrls(fetchFn)
  assertEquals(requests[0].headers.get('user-agent'), USER_AGENT)
  assertEquals(USER_AGENT.includes('github.com/mzgajner/digestor'), true)
})

Deno.test(async function fetchEpisodeUrlsFailsOnBlockedListingTest() {
  const { fetchFn } = fakeFetch([listing(['a'])], 403)
  await assertRejects(
    () => fetchEpisodeUrls(fetchFn),
    Error,
    'Listing page 0 returned HTTP 403.',
  )
})

Deno.test(async function fetchEpisodeUrlsFailsOnEmptyListingTest() {
  // What an anti-bot challenge page looks like to the scraper: a 200 with no
  // episode links in it.
  const { fetchFn } = fakeFetch([
    '<html><body>Checking your browser</body></html>',
  ])
  await assertRejects(
    () => fetchEpisodeUrls(fetchFn),
    Error,
    'no episode URLs',
  )
})
