import { load } from 'https://deno.land/std/dotenv/mod.ts'
import { parseFeed } from 'https://deno.land/x/rss/mod.ts'
import { type FeedEntry } from 'https://deno.land/x/rss/src/types/feed.ts'

import { testPodcastXml } from './test-xml.ts'

export type PodcastFeedEntry = FeedEntry & {
  'itunes:summary': { value: string }
}

const env = await load()

const PODCAST_FEED_URL =
  'https://radiostudent.si/kultura/pritiskavec-gold/podcast'

// Spotify complained these contain copyrighted material, so we're excluding
// them from the feed to avoid any issues.
const SPOTIFY_BLACKLIST = [
  'Skupaj je lažje',
  'Mrknil je Telltale',
  'Portal',
  'Jagodni izbor sezone 2017/18',
  'Iz Rusije z ljubeznijo',
  'Slišati igro',
]

export default async function fetchPodcastEntries() {
  // Don't actually fetch, just return test data if in development
  if (env['ENVIRONMENT'] === 'development') {
    const feed = await parseFeed(testPodcastXml)
    return feed.entries as PodcastFeedEntry[]
  }

  const entries: PodcastFeedEntry[] = []
  let keepFetching = true
  let currentPage = 0

  while (keepFetching) {
    const feed = await getFeedFromUrl(`${PODCAST_FEED_URL}?page=${currentPage}`)
    entries.push(...feed.entries as PodcastFeedEntry[])

    const entriesInLastRequest = feed.entries.length
    keepFetching = entriesInLastRequest > 0
    currentPage++
  }

  return entries.filter((entry) =>
    !SPOTIFY_BLACKLIST.includes(entry.title?.value ?? '')
  )
}

async function getFeedFromUrl(url: string) {
  const response = await fetch(url)
  const xml = await response.text()
  const feed = await parseFeed(xml)

  return feed
}
