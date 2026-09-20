import { assertEquals } from 'https://deno.land/std/assert/mod.ts'
import {
  buildCues,
  formatSrtTimestamp,
  formatVttTimestamp,
  toPodcastJson,
  toSrt,
  toVtt,
  transcriptUrl,
  wrapLines,
} from './formats.ts'
import type { Transcript } from './types.ts'

function transcript(
  segments: Transcript['segments'],
): Transcript {
  return {
    version: 1,
    guid: '26613',
    title: 'Pilot',
    audioUrl: 'https://example.com/a.mp3',
    audioDuration: 60,
    language: 'sl',
    engine: 'faster-whisper',
    model: 'large-v3',
    createdAt: '2026-09-13T10:00:00.000Z',
    wallSeconds: 30,
    segments,
  }
}

Deno.test(function formatVttTimestampTest() {
  assertEquals(formatVttTimestamp(0), '00:00:00.000')
  assertEquals(formatVttTimestamp(3661.5), '01:01:01.500')
  assertEquals(formatVttTimestamp(36000.25), '10:00:00.250')
  assertEquals(formatVttTimestamp(2.0006), '00:00:02.001')
})

Deno.test(function formatSrtTimestampTest() {
  assertEquals(formatSrtTimestamp(3661.5), '01:01:01,500')
})

Deno.test(function wrapLinesTest() {
  assertEquals(wrapLines('kratek stavek', 42), 'kratek stavek')
  assertEquals(
    wrapLines('to je precej daljši stavek, ki ga je treba prelomiti', 30),
    'to je precej daljši stavek,\nki ga je treba prelomiti',
  )
})

Deno.test(function buildCuesKeepsShortSegmentIntactTest() {
  const cues = buildCues([
    {
      start: 0,
      end: 2,
      text: 'Živjo vsem.',
      words: [
        { start: 0, end: 1, word: 'Živjo' },
        { start: 1, end: 2, word: 'vsem.' },
      ],
    },
  ])
  assertEquals(cues, [{ start: 0, end: 2, text: 'Živjo vsem.' }])
})

Deno.test(function buildCuesJoinsHyphenatedSuffixesWithoutSpaceTest() {
  const cues = buildCues([
    {
      start: 0,
      end: 3,
      text: 'Game Boy-a, ne, v 90-ih',
      words: [
        { start: 0, end: 0.5, word: 'Game' },
        { start: 0.5, end: 1, word: 'Boy' },
        { start: 1, end: 1.2, word: '-a,' },
        { start: 1.2, end: 1.5, word: 'ne,' },
        { start: 1.5, end: 2, word: 'v' },
        { start: 2, end: 2.5, word: '90' },
        { start: 2.5, end: 3, word: '-ih' },
        { start: 3, end: 3.2, word: 'pri' },
        { start: 3.2, end: 3.4, word: '4' },
        { start: 3.4, end: 3.6, word: ',9' },
        { start: 3.6, end: 3.8, word: 'MHz' },
      ],
    },
  ])
  assertEquals(cues.map((c) => c.text), ['Game Boy-a, ne, v 90-ih pri 4,9 MHz'])
})

Deno.test(function buildCuesSplitsOnCharLimitTest() {
  const words = Array.from({ length: 10 }, (_, i) => ({
    start: i,
    end: i + 1,
    word: 'beseda',
  }))
  const cues = buildCues(
    [{ start: 0, end: 10, text: words.map((w) => w.word).join(' '), words }],
    { maxChars: 20, maxSeconds: 100, pauseSeconds: 100 },
  )
  assertEquals(cues.map((c) => c.text), [
    'beseda beseda beseda',
    'beseda beseda beseda',
    'beseda beseda beseda',
    'beseda',
  ])
  assertEquals(cues[0], { start: 0, end: 3, text: 'beseda beseda beseda' })
  assertEquals(cues[3], { start: 9, end: 10, text: 'beseda' })
})

Deno.test(function buildCuesSplitsOnDurationTest() {
  const words = Array.from({ length: 5 }, (_, i) => ({
    start: i * 3,
    end: i * 3 + 2,
    word: 'a',
  }))
  const cues = buildCues(
    [{ start: 0, end: 14, text: 'a a a a a', words }],
    { maxChars: 1000, maxSeconds: 7, pauseSeconds: 100 },
  )
  assertEquals(cues.map((c) => c.text), ['a a', 'a a', 'a'])
})

Deno.test(function buildCuesSplitsOnPauseTest() {
  const cues = buildCues(
    [{
      start: 0,
      end: 6,
      text: 'prvi del drugi del',
      words: [
        { start: 0, end: 1, word: 'prvi' },
        { start: 1, end: 2, word: 'del' },
        { start: 4, end: 5, word: 'drugi' },
        { start: 5, end: 6, word: 'del' },
      ],
    }],
    { maxChars: 1000, maxSeconds: 100, pauseSeconds: 1 },
  )
  assertEquals(cues, [
    { start: 0, end: 2, text: 'prvi del' },
    { start: 4, end: 6, text: 'drugi del' },
  ])
})

Deno.test(function buildCuesPrefersSentenceEndOnceLongEnoughTest() {
  const text = 'To je konec. In to je nov stavek'
  const words = text.split(' ').map((word, i) => ({
    start: i,
    end: i + 1,
    word,
  }))
  const cues = buildCues(
    [{ start: 0, end: words.length, text, words }],
    { maxChars: 20, maxSeconds: 100, pauseSeconds: 100 },
  )
  assertEquals(cues.map((c) => c.text), ['To je konec.', 'In to je nov stavek'])
})

Deno.test(function buildCuesWithoutWordsSplitsProportionallyTest() {
  const cues = buildCues(
    [{ start: 0, end: 10, text: 'aaaa bbbb cccc dddd' }],
    { maxChars: 9, maxSeconds: 100, pauseSeconds: 100 },
  )
  assertEquals(cues, [
    { start: 0, end: 5, text: 'aaaa bbbb' },
    { start: 5, end: 10, text: 'cccc dddd' },
  ])
})

Deno.test(function buildCuesNeverMergesAcrossSegmentsTest() {
  const cues = buildCues([
    { start: 0, end: 1, text: 'a', words: [{ start: 0, end: 1, word: 'a' }] },
    { start: 1, end: 2, text: 'b', words: [{ start: 1, end: 2, word: 'b' }] },
  ])
  assertEquals(cues.map((c) => c.text), ['a', 'b'])
})

Deno.test(function buildCuesCleansUpTimingAndTextTest() {
  const cues = buildCues([
    { start: 0, end: 3, text: '  prvi   ' },
    { start: 2.5, end: 2.6, text: 'drugi' },
    { start: 5, end: 6, text: '   ' },
  ])
  assertEquals(cues, [
    { start: 0, end: 3, text: 'prvi' },
    { start: 3, end: 3.2, text: 'drugi' },
  ])
})

Deno.test(function buildCuesCapsRunawayCueDurationTest() {
  // A single word whose end time drifts across a music break must not stay on
  // screen for minutes.
  const cues = buildCues(
    [{
      start: 100,
      end: 240,
      text: 'Evo',
      words: [{ start: 100, end: 240, word: 'Evo' }],
    }, { start: 240, end: 260, text: 'Ja.' }],
    { maxSeconds: 7 },
  )
  assertEquals(cues, [
    { start: 100, end: 107, text: 'Evo' },
    { start: 240, end: 247, text: 'Ja.' },
  ])
})

Deno.test(function buildCuesCarriesSpeakerTest() {
  const cues = buildCues([
    { start: 0, end: 1, text: 'hej', speaker: 'Mato' },
  ])
  assertEquals(cues, [{ start: 0, end: 1, text: 'hej', speaker: 'Mato' }])
})

Deno.test(function toVttTest() {
  const vtt = toVtt(transcript([
    { start: 0, end: 1.5, text: 'Ena & dva <tri>' },
    { start: 1.5, end: 3, text: 'Štiri', speaker: 'Mato' },
  ]))
  assertEquals(
    vtt,
    [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:01.500',
      'Ena &amp; dva &lt;tri&gt;',
      '',
      '00:00:01.500 --> 00:00:03.000',
      '<v Mato>Štiri',
      '',
    ].join('\n'),
  )
})

Deno.test(function toSrtTest() {
  const srt = toSrt(transcript([
    { start: 0, end: 1.5, text: 'Ena' },
    { start: 1.5, end: 3, text: 'Dva', speaker: 'Mato' },
  ]))
  assertEquals(
    srt,
    [
      '1',
      '00:00:00,000 --> 00:00:01,500',
      'Ena',
      '',
      '2',
      '00:00:01,500 --> 00:00:03,000',
      'Mato: Dva',
      '',
    ].join('\n'),
  )
})

Deno.test(function toPodcastJsonTest() {
  const json = JSON.parse(toPodcastJson(transcript([
    { start: 0, end: 1.5, text: 'Ena' },
    { start: 1.5, end: 3, text: 'Dva', speaker: 'Mato' },
  ])))
  assertEquals(json, {
    version: '1.0.0',
    segments: [
      { startTime: 0, endTime: 1.5, body: 'Ena' },
      { speaker: 'Mato', startTime: 1.5, endTime: 3, body: 'Dva' },
    ],
  })
  assertEquals('speaker' in json.segments[0], false)
})

Deno.test(function transcriptUrlTest() {
  assertEquals(
    transcriptUrl('26613', 'vtt'),
    'https://pritiskavec.z0.si/podcast/transcripts/26613.vtt',
  )
  assertEquals(
    transcriptUrl('1', 'srt', 'http://localhost:8080'),
    'http://localhost:8080/podcast/transcripts/1.srt',
  )
})
