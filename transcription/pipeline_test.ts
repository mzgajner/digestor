import { assertEquals } from 'https://deno.land/std/assert/mod.ts'
import type { ParsedEntry } from '../parse.ts'
import {
  recueEpisode,
  selectPending,
  transcribeEpisode,
  transcribeMissing,
  withinDays,
} from './pipeline.ts'
import type { TranscribeDeps } from './pipeline.ts'
import { createFileStore } from './store.ts'
import type { Transcriber } from './transcriber.ts'

function entry(guid: string, date: string, title = `Ep ${guid}`): ParsedEntry {
  return {
    imageUrl: '',
    authors: ['A'],
    description: undefined,
    subtitle: undefined,
    date: new Date(date),
    enclosure: { url: `https://example.com/${guid}.mp3`, size: 5 },
    duration: 60,
    url: `https://example.com/${guid}`,
    guid,
    title,
  }
}

type Harness = TranscribeDeps & { lines: string[]; transcribed: string[] }

async function harness(
  behaviour: (audioPath: string) => void = () => {},
  audioDuration = 60,
): Promise<Harness> {
  const dir = await Deno.makeTempDir()
  const lines: string[] = []
  const transcribed: string[] = []
  const transcriber: Transcriber = {
    model: 'tiny',
    // deno-lint-ignore require-await
    async transcribe({ audioPath }) {
      transcribed.push(audioPath)
      behaviour(audioPath)
      return {
        engine: 'fake',
        model: 'tiny',
        language: 'sl',
        audioDuration,
        segments: [{
          start: 0,
          end: 2,
          text: 'hej vsem',
          words: [
            { start: 0, end: 1, word: 'hej' },
            { start: 1, end: 2, word: 'vsem' },
          ],
        }],
      }
    },
  }
  return {
    lines,
    transcribed,
    store: createFileStore(`${dir}/transcripts`),
    transcriber,
    download: async (_url, dest) => {
      await Deno.mkdir(dest.replace(/\/[^/]+$/, ''), { recursive: true })
      await Deno.writeTextFile(dest, 'audio')
    },
    log: {
      info: (m) => lines.push(`INFO ${m}`),
      warn: (m) => lines.push(`WARN ${m}`),
    },
    audioCacheDir: `${dir}/audio`,
    rawCacheDir: `${dir}/raw`,
  }
}

Deno.test(async function transcribeEpisodeWritesCuedTranscriptTest() {
  const deps = await harness()
  const result = await transcribeEpisode(entry('1', '2016-01-01'), deps)

  assertEquals(result.status, 'done')
  const stored = await deps.store.read('1')
  assertEquals(stored.guid, '1')
  assertEquals(stored.title, 'Ep 1')
  assertEquals(stored.model, 'tiny')
  assertEquals(stored.audioDuration, 60)
  assertEquals(stored.segments, [{ start: 0, end: 2, text: 'hej vsem' }])
  assertEquals(deps.transcribed, [`${deps.audioCacheDir}/1.mp3`])
})

Deno.test(async function transcribeEpisodeSavesRawOutputAndRemovesAudioTest() {
  const deps = await harness()
  await transcribeEpisode(entry('1', '2016-01-01'), deps)

  const raw = JSON.parse(await Deno.readTextFile(`${deps.rawCacheDir}/1.json`))
  assertEquals(raw.segments[0].words.length, 2)
  let audioExists = true
  try {
    await Deno.stat(`${deps.audioCacheDir}/1.mp3`)
  } catch {
    audioExists = false
  }
  assertEquals(audioExists, false)
})

Deno.test(async function transcribeEpisodeSkipsExistingUnlessForcedTest() {
  const deps = await harness()
  await transcribeEpisode(entry('1', '2016-01-01'), deps)
  assertEquals(
    (await transcribeEpisode(entry('1', '2016-01-01'), deps)).status,
    'skipped',
  )
  assertEquals(deps.transcribed.length, 1)
  const forced = await transcribeEpisode(entry('1', '2016-01-01'), deps, {
    force: true,
  })
  assertEquals(forced.status, 'done')
  assertEquals(deps.transcribed.length, 2)
})

Deno.test(async function transcribeEpisodeSkipsMissingGuidTest() {
  const deps = await harness()
  const result = await transcribeEpisode(
    entry('', '2016-01-01', 'No guid'),
    deps,
  )
  assertEquals(result.status, 'skipped')
  assertEquals(deps.lines, ['WARN Skipping "No guid": missing guid.'])
})

Deno.test(async function transcribeEpisodeReportsFailureAndKeepsAudioTest() {
  const deps = await harness(() => {
    throw new Error('sidecar exploded')
  })
  const result = await transcribeEpisode(entry('1', '2016-01-01'), deps)
  assertEquals(result.status, 'failed')
  assertEquals(result.error, 'sidecar exploded')
  assertEquals(await deps.store.has('1'), false)
  assertEquals(deps.lines.at(-1), 'WARN Failed "Ep 1" (1): sidecar exploded')
  await Deno.stat(`${deps.audioCacheDir}/1.mp3`)
})

Deno.test(async function transcribeEpisodeRejectsTruncatedAudioTest() {
  const deps = await harness(() => {}, 30)
  const result = await transcribeEpisode(entry('1', '2016-01-01'), deps)
  assertEquals(result.status, 'failed')
  assertEquals(
    result.error,
    'Decoded audio is 30 s but the episode is 60 s long; refusing to store a truncated transcript.',
  )
  assertEquals(await deps.store.has('1'), false)
})

Deno.test(async function transcribeEpisodeToleratesSmallDurationDriftTest() {
  const deps = await harness(() => {}, 57)
  const result = await transcribeEpisode(entry('1', '2016-01-01'), deps)
  assertEquals(result.status, 'done')
})

Deno.test(async function transcribeMissingGoesOldestFirstAndSkipsDoneTest() {
  const deps = await harness()
  const entries = [
    entry('3', '2018-01-01'),
    entry('1', '2016-01-01'),
    entry('2', '2017-01-01'),
  ]
  await transcribeEpisode(entries[2], deps)
  deps.transcribed.length = 0

  const results = await transcribeMissing(entries, deps)
  assertEquals(results.map((r) => [r.guid, r.status]), [['1', 'done'], [
    '3',
    'done',
  ]])
  assertEquals(deps.transcribed, [
    `${deps.audioCacheDir}/1.mp3`,
    `${deps.audioCacheDir}/3.mp3`,
  ])
  assertEquals(
    deps.lines.at(-1),
    'INFO Done: 2 transcribed, 1 skipped, 0 failed.',
  )
})

Deno.test(async function transcribeMissingHonoursLimitTest() {
  const deps = await harness()
  const entries = [entry('1', '2016-01-01'), entry('2', '2017-01-01')]
  const results = await transcribeMissing(entries, deps, { limit: 1 })
  assertEquals(results.map((r) => r.guid), ['1'])
})

Deno.test(async function transcribeMissingAbortsAfterConsecutiveFailuresTest() {
  const deps = await harness(() => {
    throw new Error('bad model')
  })
  const entries = Array.from(
    { length: 5 },
    (_, i) => entry(String(i + 1), `201${i}-01-01`),
  )
  const results = await transcribeMissing(entries, deps, {
    maxConsecutiveFailures: 2,
  })
  assertEquals(results.length, 2)
  assertEquals(
    deps.lines.some((l) => l.includes('Aborting after 2 consecutive failures')),
    true,
  )
})

Deno.test(async function recueEpisodeRebuildsCuesFromRawOutputTest() {
  const deps = await harness()
  await transcribeEpisode(entry('1', '2016-01-01'), deps)
  const before = await deps.store.read('1')
  // Pretend the stored cues came from older, worse cue rules.
  await deps.store.write('1', { ...before, segments: [] })

  const result = await recueEpisode('1', deps)

  assertEquals(result, 'done')
  const after = await deps.store.read('1')
  assertEquals(after.segments, before.segments)
  assertEquals(after.createdAt, before.createdAt)
  assertEquals(after.wallSeconds, before.wallSeconds)
})

Deno.test(async function recueEpisodeSkipsWithoutRawOutputTest() {
  const deps = await harness()
  assertEquals(await recueEpisode('404', deps), 'skipped')
})

Deno.test(async function selectPendingOrdersFiltersAndLimitsTest() {
  const deps = await harness()
  const entries = [
    entry('3', '2018-01-01'),
    entry('1', '2016-01-01'),
    entry('2', '2017-01-01'),
  ]
  await transcribeEpisode(entries[2], deps)

  const oldest = await selectPending(entries, deps.store)
  assertEquals(oldest.map((e) => e.guid), ['1', '3'])
  const newest = await selectPending(entries, deps.store, {
    oldestFirst: false,
    limit: 1,
  })
  assertEquals(newest.map((e) => e.guid), ['3'])
  const forced = await selectPending(entries, deps.store, { force: true })
  assertEquals(forced.map((e) => e.guid), ['1', '2', '3'])
})

Deno.test(function withinDaysKeepsRecentEntriesTest() {
  const now = new Date('2026-09-20T00:00:00Z')
  const entries = [
    entry('old', '2026-06-01'),
    entry('recent', '2026-09-08'),
  ]
  assertEquals(withinDays(entries, 60, now).map((e) => e.guid), ['recent'])
})
