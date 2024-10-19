/// <reference lib="deno.unstable" />

import fetchPodcastEntries from './fetch.ts'
import { generateFeed } from './generate.ts'
import { parseEntries } from './parse.ts'

const podcastEntries = await fetchPodcastEntries()
const entries = await parseEntries(podcastEntries)
const feed = generateFeed(entries)

const encoder = new TextEncoder()
const data = encoder.encode(feed)
await Deno.writeFile('feed.rss', data)
