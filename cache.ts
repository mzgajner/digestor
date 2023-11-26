import type { ParsedEntry } from './parse.ts'

const kv = await Deno.openKv()

// Entries are individually cached in Deno KV for 1 day
export async function loadEntriesFromCache() {
  let entries: ParsedEntry[] = []
  const iter = kv.list<ParsedEntry[]>({ prefix: ['entries'] })

  for await (const entry of iter) entries = entries.concat(entry.value)

  return entries
}

export async function saveEntriesToCache(entries: ParsedEntry[]) {
  const DAY_IN_MS = 24 * 60 * 60 * 1000

  const entryChunks = createChunks(entries, 10)
  const session = kv.atomic()

  entryChunks.forEach((chunk) => {
    const key = chunk.map((entry) => entry.guid).join('|')
    session.set(['entries', key], chunk, { expireIn: DAY_IN_MS })
  })

  await session.commit()
}

export function createChunks<T>(array: T[], chunkSize: number): T[][] {
  const chunks = []
  let start = 0

  while (start < array.length) {
    const end = Math.min(start + chunkSize, array.length)
    chunks.push(array.slice(start, end))
    start = end
  }

  return chunks
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
