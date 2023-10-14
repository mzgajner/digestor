import type { ParsedEntry } from './parse.ts'

const kv = await Deno.openKv()

// Entries are individually cached in Deno KV for 1 day
export async function loadEntriesFromCache() {
  const entries: ParsedEntry[] = []
  const iter = kv.list<ParsedEntry>({ prefix: ['entries'] })

  for await (const entry of iter) entries.push(entry.value)

  return entries
}

export async function saveEntriesToCache(entries: ParsedEntry[]) {
  const DAY_IN_MS = 24 * 60 * 60 * 1000

  const session = kv.atomic()

  entries.forEach((entry) => {
    session.set(['entries'], entry, { expireIn: DAY_IN_MS })
  })

  await session.commit()
}

// Entire generated feed is stored in memory for an hour
let lastFeedUpdate = 0
let generatedFeedCache = ''

export function loadFeedFromCache() {
  const HOUR_IN_MS = 60 * 60 * 1000
  const now = new Date().getTime()

  if (now - lastFeedUpdate < HOUR_IN_MS) {
    return generatedFeedCache
  } else {
    generatedFeedCache = ''
    return null
  }
}

export function saveFeedToCache(feed: string) {
  lastFeedUpdate = new Date().getTime()
  generatedFeedCache = feed
}
