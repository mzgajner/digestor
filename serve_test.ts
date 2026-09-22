import { assertEquals } from 'https://deno.land/std/assert/mod.ts'
import { matchTranscriptRoute, serveTranscript } from './serve.ts'
import { FORMATS } from './transcription/formats.ts'

Deno.test(function matchTranscriptRouteTest() {
  assertEquals(
    matchTranscriptRoute('/podcast/transcripts/26613.vtt')?.guid,
    '26613',
  )
  assertEquals(
    matchTranscriptRoute('/podcast/transcripts/26613.srt')?.format.mimeType,
    'application/x-subrip',
  )
  assertEquals(
    matchTranscriptRoute('/podcast/transcripts/26613.json')?.format.extension,
    'json',
  )
  assertEquals(matchTranscriptRoute('/podcast/transcripts/26613.txt'), null)
  assertEquals(matchTranscriptRoute('/podcast/transcripts/../feed.xml'), null)
  assertEquals(matchTranscriptRoute('/podcast/transcripts/abc.vtt'), null)
  assertEquals(matchTranscriptRoute('/podcast/feed.xml'), null)
})

Deno.test(async function serveTranscriptRendersStoredTranscriptTest() {
  const vtt = FORMATS.find((format) => format.extension === 'vtt')!
  const request = new Request('http://localhost/podcast/transcripts/26613.vtt')

  const response = await serveTranscript(request, '26613', vtt)
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('content-type'), 'text/vtt; charset=utf-8')
  assertEquals((await response.text()).startsWith('WEBVTT\n'), true)

  const head = await serveTranscript(
    new Request(request.url, { method: 'HEAD' }),
    '26613',
    vtt,
  )
  assertEquals(head.status, 200)
  assertEquals(await head.text(), '')

  assertEquals((await serveTranscript(request, '1', vtt)).status, 404)
})
