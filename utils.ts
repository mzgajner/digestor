// Sent with every request to the source site, so its admins can tell who is
// scraping and have something to allowlist.
export const USER_AGENT = 'digestor (+https://github.com/mzgajner/digestor)'

export type FetchFn = typeof fetch

export type BackoffOptions = {
  fetchFn?: FetchFn
  // First pause after a rate-limit answer; doubles on each further attempt.
  retryDelayMs?: number
  // Injectable for tests.
  sleep?: (ms: number) => Promise<void>
}

// The source's anti-bot proxy answers bursts from datacenter addresses with
// 418 (and a rate limiter would say 429).
const RATE_LIMITED = new Set([418, 429])
const ATTEMPTS = 4

export function sleep(ms: number): Promise<void> {
  return ms > 0
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : Promise.resolve()
}

// fetch() for the source site: identifies itself, retries rate-limit answers
// with growing pauses (honouring Retry-After) and throws on any other error
// status, so callers only ever see a successful response.
export async function fetchWithBackoff(
  url: string,
  init: RequestInit = {},
  { fetchFn = fetch, retryDelayMs = 30000, sleep: pause = sleep }:
    BackoffOptions = {},
): Promise<Response> {
  const headers = { ...init.headers, 'User-Agent': USER_AGENT }
  for (let attempt = 1;; attempt++) {
    const response = await fetchFn(url, { ...init, headers })
    if (response.ok) return response
    await response.body?.cancel()
    if (!RATE_LIMITED.has(response.status) || attempt === ATTEMPTS) {
      throw new Error(`HTTP ${response.status} for ${url}`)
    }
    const retryAfter = Number(response.headers.get('retry-after')) * 1000
    const delay = Math.max(retryDelayMs * 2 ** (attempt - 1), retryAfter || 0)
    console.warn(
      `HTTP ${response.status} for ${url}, retrying in ${delay / 1000} s.`,
    )
    await pause(delay)
  }
}

export function generateHumanReadableAuthors(names: string[]) {
  if (names.length === 0) {
    return undefined
  } else if (names.length === 1) {
    return names[0]
  } else {
    const last = names.pop()
    return `${names.join(', ')} in ${last}`
  }
}

export function getLastName(name: string) {
  const parts = name.split(' ')
  return parts[parts.length - 1]
}

export function convertBytesToSeconds(bytes: number, bitrate = 320) {
  const kilobytes = bytes / 1000
  const kilobits = kilobytes * 8
  const seconds = kilobits / bitrate // MP3 bitrate is in kilobits/second

  return Math.round(seconds)
}
