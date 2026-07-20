/// <reference lib="deno.unstable" />

import { serve404, serveLanding, serveLogo, serveStaticFeed } from './serve.ts'

// Dokku (and most PaaS) inject configuration as real environment variables and
// set PORT to the port the app must listen on, so we read straight from the
// process env. Locally `deno task dev` can still export PORT via a .env file.
const port = Number(Deno.env.get('PORT')) || 8080

async function handleRoute(request: Request): Promise<Response> {
  const url = new URL(request.url)

  console.log(`Requesting path "${url.pathname}".`)

  switch (url.pathname) {
    case '/podcast/feed.xml':
      return await serveStaticFeed(request)
    case '/logo.jpg':
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
