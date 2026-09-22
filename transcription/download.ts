import { dirname } from 'https://deno.land/std/path/mod.ts'
import { USER_AGENT } from '../utils.ts'

export type DownloadOptions = {
  // When given, an existing file of exactly this size is reused and a
  // finished download of a different size is treated as a failure.
  expectedSize?: number
  attempts?: number
}

const BACKOFF_MS = [1000, 5000, 15000]

// Streams a URL to disk via a .part file that is renamed on completion, so a
// partially downloaded file is never mistaken for a complete one.
export async function downloadFile(
  url: string,
  dest: string,
  { expectedSize, attempts = 3 }: DownloadOptions = {},
): Promise<void> {
  if (expectedSize && (await fileSize(dest)) === expectedSize) return

  await Deno.mkdir(dirname(dest), { recursive: true })
  const part = `${dest}.part`

  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await downloadOnce(url, part)
      const size = await fileSize(part)
      if (expectedSize && size !== expectedSize) {
        throw new Error(`expected ${expectedSize} bytes, got ${size}`)
      }
      await Deno.rename(part, dest)
      return
    } catch (error) {
      lastError = error
      await Deno.remove(part).catch(() => {})
      if (attempt < attempts) await sleep(BACKOFF_MS[attempt - 1])
    }
  }

  const message = lastError instanceof Error ? lastError.message : lastError
  throw new Error(
    `Failed to download "${url}" after ${attempts} attempts: ${message}`,
  )
}

async function downloadOnce(url: string, path: string) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error(`HTTP ${response.status}`)
  }
  const file = await Deno.open(path, {
    write: true,
    create: true,
    truncate: true,
  })
  await response.body.pipeTo(file.writable)
}

async function fileSize(path: string) {
  try {
    return (await Deno.stat(path)).size
  } catch {
    return null
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
