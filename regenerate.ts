/// <reference lib="deno.unstable" />

import { fetchAllEntries } from './fetch.ts'
import { generateFeed } from './generate.ts'
import { parseEntries } from './parse.ts'

const { newsEntries, podcastEntries } = await fetchAllEntries()
const entries = parseEntries(newsEntries, podcastEntries)
const feed = generateFeed(entries)

const encoder = new TextEncoder()
const data = encoder.encode(feed)
await Deno.writeFile('feed.rss', data)
