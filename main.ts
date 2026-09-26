/// <reference lib="deno.unstable" />

import {
  matchTranscriptRoute,
  serve404,
  serveLanding,
  serveLogo,
  serveStaticFeed,
  serveTranscript,
} from './serve.ts'

// Dokku (and most PaaS) inject configuration as real environment variables and
// set PORT to the port the app must listen on, so we read straight from the
// process env. Locally `deno task dev` can still export PORT via a .env file.
const port = Number(Deno.env.get('PORT')) || 8080

// When set (e.g. on the retired deno.dev deployment), every request is
// permanently redirected to the same path on the new host. This migrates any
// podcast client subscribed to the old feed URL, not just Apple (which also
// reads the <itunes:new-feed-url> tag). Leave it unset on the live deployment.
const redirectBaseUrl = Deno.env.get('REDIRECT_BASE_URL')

async function handleRoute(request: Request): Promise<Response> {
  const url = new URL(request.url)

  console.log(`Requesting path "${url.pathname}".`)

  if (redirectBaseUrl) {
    return Response.redirect(new URL(url.pathname, redirectBaseUrl), 301)
  }

  const transcript = matchTranscriptRoute(url.pathname)
  if (transcript) {
    return await serveTranscript(request, transcript.guid, transcript.format)
  }

  switch (url.pathname) {
    case '/podcast/feed.xml':
      return await serveStaticFeed(request)
    case '/logo.png':
      return await serveLogo(request)
    case '/':
    case '/index.htm':
    case '/index.html':
      return await serveLanding(request)
    default:
      return serve404()
  }
}

Deno.serve({ port }, handleRoute)
