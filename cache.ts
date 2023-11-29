import type { ParsedEntry } from './parse.ts'

const kv = await Deno.openKv()

// Entries are individually cached in Deno KV for 1 day
export async function loadEntriesFromCache() {
  console.log('Loading entries from Deno KV cache.')

  let entries: ParsedEntry[] = []
  const iter = kv.list<ParsedEntry[]>({ prefix: ['entries'] })

  let loopCount = 0
  for await (const entry of iter) {
    entries = entries.concat(entry.value)
    loopCount++
  }

  console.log(`Ran for loop ${loopCount} times, found ${entries.length} entries.`)

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
