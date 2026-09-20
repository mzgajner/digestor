import { STATUS_CODE } from 'https://deno.land/std/http/status.ts'
import { TRANSCRIPTS_DIR } from './transcription/config.ts'
import { FORMATS } from './transcription/formats.ts'
import { transcriptPath } from './transcription/store.ts'

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

export async function serveLogo(request: Request) {
  const LOGO = await Deno.readFile('./logo.jpg')
  return generateResponse(LOGO, request, 'image/jpeg')
}

export const serve404 = () => NOT_FOUND_RESPONSE

const TRANSCRIPT_ROUTE = /^\/podcast\/transcripts\/(\d+)\.([a-z]+)$/

// Matches /podcast/transcripts/<guid>.<ext>. The guid is digits only, so a
// path can never escape the transcripts directory.
export function matchTranscriptRoute(pathname: string) {
  const match = pathname.match(TRANSCRIPT_ROUTE)
  if (!match) return null
  const [, guid, extension] = match
  const format = FORMATS.find((format) => format.extension === extension)
  return format ? { guid, format } : null
}

// Renders the committed transcript JSON into the requested format on the fly.
export async function serveTranscript(
  request: Request,
  guid: string,
  format: (typeof FORMATS)[number],
) {
  let json: string
  try {
    json = await Deno.readTextFile(transcriptPath(TRANSCRIPTS_DIR, guid))
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return NOT_FOUND_RESPONSE
    throw error
  }
  const body = format.render(JSON.parse(json))
  return generateResponse(body, request, `${format.mimeType}; charset=utf-8`, {
    'Cache-Control': 'public, max-age=3600',
  })
}

function generateResponse(
  payload: BodyInit,
  request: Request,
  contentType: string,
  extraHeaders: Record<string, string> = {},
) {
  if (!['GET', 'HEAD'].includes(request.method)) return NOT_FOUND_RESPONSE

  const body = request.method === 'HEAD' ? null : payload
  const headers = {
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
    ...extraHeaders,
  }
  const status = STATUS_CODE.OK

  return new Response(body, { headers, status })
}
