import type { ParsedEntry } from '../parse.ts'
import { LANGUAGE } from './config.ts'
import { downloadFile } from './download.ts'
import { buildCues } from './formats.ts'
import type { Logger } from './log.ts'
import type { TranscriptStore } from './store.ts'
import type { Progress, TranscribeOutput, Transcriber } from './transcriber.ts'
import type { Transcript } from './types.ts'

export type TranscribeDeps = {
  store: TranscriptStore
  transcriber: Transcriber
  download: typeof downloadFile
  log: Logger
  // Where downloaded audio lives until the episode is transcribed.
  audioCacheDir: string
  // Where the raw sidecar output (with word timings) is kept for re-cueing.
  rawCacheDir: string
}

export type EpisodeResult = {
  guid: string
  title: string
  status: 'done' | 'skipped' | 'failed'
  wallSeconds?: number
  realtimeFactor?: number
  error?: string
}

export type EpisodeOptions = { force?: boolean }

export type BatchOptions = EpisodeOptions & {
  limit?: number
  oldestFirst?: boolean
  // A run is aborted after this many failures in a row, which is what a wrong
  // model name or a broken sidecar environment looks like.
  maxConsecutiveFailures?: number
}

// The engine can't run at all (not built, models missing), as opposed to one
// episode failing. Raised before any audio is downloaded.
export class TranscriberUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TranscriberUnavailableError'
  }
}

// Console progress is reported at most once per this much audio.
const PROGRESS_EVERY_SECONDS = 60

export async function transcribeEpisode(
  entry: ParsedEntry,
  deps: TranscribeDeps,
  { force = false }: EpisodeOptions = {},
): Promise<EpisodeResult> {
  const { guid, title } = entry
  const result = { guid, title }

  if (!guid) {
    deps.log.warn(`Skipping "${title}": missing guid.`)
    return { ...result, status: 'skipped' }
  }
  if (!force && await deps.store.has(guid)) {
    return { ...result, status: 'skipped' }
  }

  const audioPath = `${deps.audioCacheDir}/${guid}.mp3`
  try {
    deps.log.info(
      `Transcribing "${title}" (${guid}) with model "${deps.transcriber.model}".`,
    )
    await deps.download(entry.enclosure.url, audioPath, {
      expectedSize: entry.enclosure.size,
    })

    const startedAt = performance.now()
    const output = await deps.transcriber.transcribe({
      audioPath,
      language: LANGUAGE,
      onProgress: progressReporter(startedAt),
    })
    const wallSeconds = Math.round((performance.now() - startedAt) / 1000)
    assertNotTruncated(output.audioDuration, entry.duration)

    await Deno.mkdir(deps.rawCacheDir, { recursive: true })
    await Deno.writeTextFile(
      `${deps.rawCacheDir}/${guid}.json`,
      JSON.stringify(output),
    )

    const transcript: Transcript = {
      version: 1,
      guid,
      title,
      audioUrl: entry.enclosure.url,
      audioDuration: output.audioDuration,
      language: LANGUAGE,
      engine: output.engine,
      model: output.model || deps.transcriber.model,
      createdAt: new Date().toISOString(),
      wallSeconds,
      segments: buildCues(output.segments),
    }
    await deps.store.write(guid, transcript)
    await Deno.remove(audioPath).catch(() => {})

    const realtimeFactor = output.audioDuration
      ? Number((wallSeconds / output.audioDuration).toFixed(2))
      : undefined
    deps.log.info(
      `Transcribed "${title}" (${guid}) in ${wallSeconds} s, audio ${
        Math.round(output.audioDuration)
      } s, realtime factor ${
        realtimeFactor ?? 'n/a'
      }, ${transcript.segments.length} cues.`,
    )
    return { ...result, status: 'done', wallSeconds, realtimeFactor }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // The audio is deliberately left in the cache so a retry skips the download.
    deps.log.warn(`Failed "${title}" (${guid}): ${message}`)
    return { ...result, status: 'failed', error: message }
  }
}

// A decoder that stops at a corrupt frame would otherwise hand us a perfectly
// valid looking transcript of the first half of an episode.
const DURATION_TOLERANCE = 0.95

function assertNotTruncated(decodedSeconds: number, episodeSeconds: number) {
  if (
    !episodeSeconds || decodedSeconds >= episodeSeconds * DURATION_TOLERANCE
  ) {
    return
  }
  throw new Error(
    `Decoded audio is ${Math.round(decodedSeconds)} s but the episode is ${
      Math.round(episodeSeconds)
    } s long; refusing to store a truncated transcript.`,
  )
}

function progressReporter(startedAt: number) {
  let nextReport = PROGRESS_EVERY_SECONDS
  return ({ processedSeconds, totalSeconds }: Progress) => {
    if (processedSeconds < nextReport || !totalSeconds) return
    nextReport = processedSeconds + PROGRESS_EVERY_SECONDS
    const fraction = processedSeconds / totalSeconds
    const elapsed = (performance.now() - startedAt) / 1000
    const eta = Math.max(0, elapsed / fraction - elapsed)
    console.log(
      `  ${Math.round(fraction * 100)}% (${Math.round(processedSeconds)} s of ${
        Math.round(totalSeconds)
      } s), elapsed ${Math.round(elapsed)} s, eta ${Math.round(eta / 60)} min.`,
    )
  }
}

// The entries a run would work on: those without a stored transcript (or all
// of them when forced), in date order, cut to the limit.
export async function selectPending(
  entries: ParsedEntry[],
  store: TranscriptStore,
  { limit, force = false, oldestFirst = true }: BatchOptions = {},
): Promise<ParsedEntry[]> {
  const ordered = [...entries].sort((a, b) =>
    oldestFirst
      ? a.date.getTime() - b.date.getTime()
      : b.date.getTime() - a.date.getTime()
  )

  const pending: ParsedEntry[] = []
  for (const entry of ordered) {
    if (force || !entry.guid || !(await store.has(entry.guid))) {
      pending.push(entry)
    }
  }
  return limit === undefined ? pending : pending.slice(0, limit)
}

// Entries published within the last `days` days. The unattended job uses this
// so it only ever handles fresh episodes and never starts backfilling (or
// retrying some old, permanently broken episode every day).
export function withinDays(
  entries: ParsedEntry[],
  days: number,
  now = new Date(),
): ParsedEntry[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000
  return entries.filter((entry) => entry.date.getTime() >= cutoff)
}

// Transcribes every entry that doesn't have a transcript yet, one at a time.
// Resumable by construction: rerunning simply skips what's already stored.
export async function transcribeMissing(
  entries: ParsedEntry[],
  deps: TranscribeDeps,
  {
    limit,
    force = false,
    oldestFirst = true,
    maxConsecutiveFailures = 3,
  }: BatchOptions = {},
): Promise<EpisodeResult[]> {
  const selected = await selectPending(entries, deps.store, {
    limit,
    force,
    oldestFirst,
  })
  let skipped = entries.length - selected.length

  if (selected.length > 0) {
    try {
      await deps.transcriber.preflight?.()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new TranscriberUnavailableError(message)
    }
  }

  const results: EpisodeResult[] = []
  let consecutiveFailures = 0
  for (const entry of selected) {
    const result = await transcribeEpisode(entry, deps, { force })
    results.push(result)
    if (result.status === 'skipped') skipped++
    consecutiveFailures = result.status === 'failed'
      ? consecutiveFailures + 1
      : 0
    if (consecutiveFailures >= maxConsecutiveFailures) {
      deps.log.warn(
        `Aborting after ${consecutiveFailures} consecutive failures.`,
      )
      break
    }
  }

  const done = results.filter((r) => r.status === 'done').length
  const failed = results.filter((r) => r.status === 'failed').length
  deps.log.info(
    `Done: ${done} transcribed, ${skipped} skipped, ${failed} failed.`,
  )
  return results
}

// Rebuilds the cues of a stored transcript from the raw engine output kept in
// the cache, so cue rules can be re-tuned without transcribing again.
export async function recueEpisode(
  guid: string,
  deps: TranscribeDeps,
): Promise<'done' | 'skipped'> {
  let raw: TranscribeOutput
  let stored: Transcript
  try {
    raw = JSON.parse(
      await Deno.readTextFile(`${deps.rawCacheDir}/${guid}.json`),
    )
    stored = await deps.store.read(guid)
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error
    deps.log.warn(`Skipping recue of ${guid}: no raw output or transcript.`)
    return 'skipped'
  }
  const segments = buildCues(raw.segments)
  await deps.store.write(guid, { ...stored, segments })
  deps.log.info(
    `Rebuilt ${segments.length} cues for "${stored.title}" (${guid}).`,
  )
  return 'done'
}
