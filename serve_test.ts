import { assertEquals } from 'https://deno.land/std/assert/mod.ts'
import { matchTranscriptRoute } from './serve.ts'

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
