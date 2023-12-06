import { Status } from 'https://deno.land/std/http/http_status.ts'

import { fetchAllEntries } from './fetch.ts'
import { parseEntries } from './parse.ts'
import { generateFeed } from './generate.ts'
import { loadEntriesFromCache, saveEntriesToCache } from './cache.ts'

export const NOT_FOUND_RESPONSE = new Response(null, {
  status: Status.NotFound,
})

export async function _serveDynamicFeed(request: Request) {
  let entries = await loadEntriesFromCache()

  if (entries.length === 0) {
    const { newsEntries, podcastEntries } = await fetchAllEntries()
    entries = parseEntries(newsEntries, podcastEntries)
    saveEntriesToCache(entries)
  }

  const feed = generateFeed(entries)

  return generateResponse(feed, request, 'application/rss+xml; charset=utf-8')
}

export async function serveStaticFeed(request: Request) {
  const FEED = await Deno.readFile('./feed.rss')
  return generateResponse(FEED, request, 'application/rss+xml; charset=utf-8')
}

export async function serveLanding(request: Request) {
  const LANDING_PAGE = await Deno.readFile('./index.html')
  return generateResponse(LANDING_PAGE, request, 'text/html; charset=utf-8')
}

export const serve404 = () => NOT_FOUND_RESPONSE

function generateResponse(
  payload: BodyInit,
  request: Request,
  contentType: string,
) {
  if (!['GET', 'HEAD'].includes(request.method)) return NOT_FOUND_RESPONSE

  const body = request.method === 'HEAD' ? null : payload
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
  }
  const status = Status.OK

  return new Response(body, { headers, status })
}
