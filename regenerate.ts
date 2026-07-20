/// <reference lib="deno.unstable" />

import fetchEpisodeUrls from './fetch.ts'
import { generateFeed } from './generate.ts'
import { parseEntries } from './parse.ts'
import { readExistingEntries } from './existing.ts'

const FEED_PATH = 'feed.rss'

// Pass --full to re-fetch every episode from scratch. By default we only fetch
// episodes that aren't already in feed.rss and reuse the rest as-is.
const full = Deno.args.includes('--full')

const episodeUrls = await fetchEpisodeUrls()
const existing = await readExistingEntries(FEED_PATH)

const newCount = episodeUrls.filter((url) => !existing.has(url)).length
console.log(
  full
    ? `Re-fetching all ${episodeUrls.length} episodes.`
    : `${existing.size} existing episodes, fetching ${newCount} new.`,
)

const entries = await parseEntries(episodeUrls, { existing, full })
const feed = generateFeed(entries)

await Deno.writeTextFile(FEED_PATH, feed)
console.log(`Wrote ${entries.length} episodes to ${FEED_PATH}.`)
