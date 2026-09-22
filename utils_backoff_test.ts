import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import { fetchWithBackoff } from './utils.ts'

function responder(statuses: number[], headers: HeadersInit = {}) {
  const calls: string[] = []
  const fetchFn = (input: string | URL | Request) => {
    calls.push(String(input))
    const status = statuses[Math.min(calls.length, statuses.length) - 1]
    return Promise.resolve(
      new Response(status === 200 ? 'ok' : null, { status, headers }),
    )
  }
  return { fetchFn, calls }
}

Deno.test(
  async function fetchWithBackoffRetriesRateLimitsWithGrowingPausesTest() {
    const { fetchFn, calls } = responder([418, 429, 200])
    const sleeps: number[] = []
    const response = await fetchWithBackoff('https://x/a', {}, {
      fetchFn,
      retryDelayMs: 10,
      sleep: (ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      },
    })
    assertEquals(response.status, 200)
    assertEquals(calls.length, 3)
    assertEquals(sleeps, [10, 20])
  },
)

Deno.test(async function fetchWithBackoffHonoursRetryAfterTest() {
  const { fetchFn } = responder([429, 200], { 'retry-after': '3' })
  const sleeps: number[] = []
  await fetchWithBackoff('https://x/a', {}, {
    fetchFn,
    retryDelayMs: 10,
    sleep: (ms) => {
      sleeps.push(ms)
      return Promise.resolve()
    },
  })
  assertEquals(sleeps, [3000])
})

Deno.test(
  async function fetchWithBackoffGivesUpAndFailsOtherErrorsAtOnceTest() {
    const limited = responder([418])
    await assertRejects(
      () =>
        fetchWithBackoff('https://x/a', {}, {
          fetchFn: limited.fetchFn,
          retryDelayMs: 0,
        }),
      Error,
      'HTTP 418',
    )
    assertEquals(limited.calls.length, 4)

    const broken = responder([500])
    await assertRejects(
      () =>
        fetchWithBackoff('https://x/a', {}, {
          fetchFn: broken.fetchFn,
          retryDelayMs: 0,
        }),
      Error,
      'HTTP 500',
    )
    assertEquals(broken.calls.length, 1)
  },
)

Deno.test(async function fetchWithBackoffSendsTheUserAgentTest() {
  let userAgent: string | null = null
  const fetchFn = (input: string | URL | Request, init?: RequestInit) => {
    userAgent = new Request(input, init).headers.get('user-agent')
    return Promise.resolve(new Response('ok'))
  }
  await fetchWithBackoff('https://x/a', { method: 'HEAD' }, { fetchFn })
  assertEquals(String(userAgent).includes('digestor'), true)
})
