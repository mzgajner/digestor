/// <reference lib="deno.unstable" />

import fetchEpisodeUrls from './fetch.ts'
import { generateFeed } from './generate.ts'
import { parseEntries } from './parse.ts'

const episodeUrls = await fetchEpisodeUrls()
const entries = await parseEntries(episodeUrls)
const feed = generateFeed(entries)

const encoder = new TextEncoder()
const data = encoder.encode(feed)
await Deno.writeFile('feed.rss', data)
