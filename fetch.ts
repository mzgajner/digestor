import { load } from 'https://deno.land/std/dotenv/mod.ts'
import { parseFeed } from 'https://deno.land/x/rss/mod.ts'
import { type FeedEntry } from 'https://deno.land/x/rss/src/types/feed.ts'

import { testNewsXml, testPodcastXml } from './test-xml.ts'

export type PodcastFeedEntry = FeedEntry & {
  'itunes:summary': { value: string }
}

const env = await load()

const NEWS_FEED_URL = 'https://radiostudent.si/taxonomy/term/55167/%2A/feed'
const PODCAST_FEED_URL =
  'https://radiostudent.si/kultura/pritiskavec-gold/podcast'

export async function fetchAllEntries() {
  const newsEntries = await fetchEntriesFromUrl(NEWS_FEED_URL, true)
  const podcastEntries = await fetchEntriesFromUrl(PODCAST_FEED_URL, false)

  return { newsEntries, podcastEntries: podcastEntries as PodcastFeedEntry[] }
}

async function fetchEntriesFromUrl(url: string, isPaginated: boolean) {
  // Don't actually fetch, just return test data if in development
  if (env['ENVIRONMENT'] === 'development') {
    const isNewsRequest = url == NEWS_FEED_URL
    const testXml = isNewsRequest ? testNewsXml : testPodcastXml
    const feed = await parseFeed(testXml)
    return feed.entries
  }

  const entries: FeedEntry[] = []
  let keepFetching = true
  let currentPage = 0

  while (keepFetching) {
    const feed = await getFeedFromUrl(
      `${url}?page=${currentPage}`,
    )
    entries.push(...feed.entries)

    const entriesInLastRequest = feed.entries.length
    keepFetching = isPaginated && entriesInLastRequest > 0
    currentPage++
  }

  return entries
}

async function getFeedFromUrl(url: string) {
  const response = await fetch(url)
  const xml = await response.text()
  const feed = await parseFeed(xml)

  return feed
}
