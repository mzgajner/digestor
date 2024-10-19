import { STATUS_CODE } from 'https://deno.land/std/http/status.ts'

export const NOT_FOUND_RESPONSE = new Response(null, {
  status: STATUS_CODE.NotFound,
})

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
  const status = STATUS_CODE.OK

  return new Response(body, { headers, status })
}
