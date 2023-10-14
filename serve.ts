import { Status } from 'https://deno.land/std/http/http_status.ts'

import { fetchAllEntries } from './fetch.ts'
import { parseEntries } from './parse.ts'
import { generateFeed } from './generate.ts'
import {
  loadEntriesFromCache,
  loadFeedFromCache,
  saveEntriesToCache,
  saveFeedToCache,
} from './cache.ts'

export const NOT_FOUND_RESPONSE = new Response(null, {
  status: Status.NotFound,
})
const LANDING_PAGE = await Deno.readFile('./index.html')

export async function serveFeed(request: Request) {
  let feed = loadFeedFromCache()

  if (!feed) {
    let entries = await loadEntriesFromCache()

    if (entries.length === 0) {
      const { newsEntries, podcastEntries } = await fetchAllEntries()
      entries = parseEntries(newsEntries, podcastEntries)
      saveEntriesToCache(entries)
    }

    feed = generateFeed(entries)
    saveFeedToCache(feed)
  }

  return generateResponse(feed, request, 'application/rss+xml; charset=utf-8')
}

export function serveLanding(request: Request) {
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
