import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import fetchEpisodeUrls, {
  BLACKLISTED_SLUGS,
  SPOTIFY_BLACKLIST,
  USER_AGENT,
} from './fetch.ts'

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
  assertEquals(await fetchEpisodeUrls(fetchFn, { pageDelayMs: 0 }), [
    'https://radiostudent.si/kultura/pritiskavec-gold/b',
    'https://radiostudent.si/kultura/pritiskavec-gold/a',
    'https://radiostudent.si/kultura/pritiskavec-gold/c',
  ])
})

Deno.test(async function fetchEpisodeUrlsIdentifiesItselfTest() {
  const { fetchFn, requests } = fakeFetch([listing(['a'])])
  await fetchEpisodeUrls(fetchFn, { pageDelayMs: 0 })
  assertEquals(requests[0].headers.get('user-agent'), USER_AGENT)
  assertEquals(USER_AGENT.includes('github.com/mzgajner/digestor'), true)
})

Deno.test(async function fetchEpisodeUrlsFailsOnBlockedListingTest() {
  const { fetchFn } = fakeFetch([listing(['a'])], 403)
  await assertRejects(
    () => fetchEpisodeUrls(fetchFn, { retryDelayMs: 0, pageDelayMs: 0 }),
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
    () => fetchEpisodeUrls(fetchFn, { pageDelayMs: 0 }),
    Error,
    'no episode URLs',
  )
})

Deno.test(async function fetchEpisodeUrlsRetriesWhenRateLimitedTest() {
  // The source sits behind an anti-bot proxy that answers bursts with 418.
  let calls = 0
  const fetchFn = () => {
    calls++
    return Promise.resolve(
      calls < 3
        ? new Response('go away', { status: 418 })
        : new Response(listing(calls === 3 ? ['a'] : []), { status: 200 }),
    )
  }
  const urls = await fetchEpisodeUrls(fetchFn, {
    retryDelayMs: 0,
    pageDelayMs: 0,
  })
  assertEquals(urls, ['https://radiostudent.si/kultura/pritiskavec-gold/a'])
  assertEquals(calls, 4)
})

Deno.test(async function fetchEpisodeUrlsGivesUpAfterRetriesTest() {
  const { fetchFn, requests } = fakeFetch([listing(['a'])], 429)
  await assertRejects(
    () => fetchEpisodeUrls(fetchFn, { retryDelayMs: 0, pageDelayMs: 0 }),
    Error,
    'Listing page 0 returned HTTP 429.',
  )
  assertEquals(requests.length, 4)
})

Deno.test(async function fetchEpisodeUrlsSkipsBlacklistedEpisodesTest() {
  const { fetchFn } = fakeFetch([listing(['portal', 'a', 'skupaj-je-lazje'])])
  assertEquals(await fetchEpisodeUrls(fetchFn, { pageDelayMs: 0 }), [
    'https://radiostudent.si/kultura/pritiskavec-gold/a',
  ])
})

Deno.test(async function fetchEpisodeUrlsPacesListingPagesTest() {
  const { fetchFn, requests } = fakeFetch([listing(['a']), listing(['b'])])
  const events: string[] = []
  await fetchEpisodeUrls(fetchFn, {
    pageDelayMs: 50,
    sleep: (ms) => {
      events.push(`sleep ${ms} after ${requests.length} requests`)
      return Promise.resolve()
    },
  })
  // Three requests (two pages plus the empty one), one pause before each
  // page after the first.
  assertEquals(events, [
    'sleep 50 after 1 requests',
    'sleep 50 after 2 requests',
  ])
})

Deno.test(function blacklistSlugsMatchBlacklistTitlesTest() {
  assertEquals(BLACKLISTED_SLUGS.size, SPOTIFY_BLACKLIST.length)
})
