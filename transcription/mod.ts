import {
  AUDIO_CACHE_DIR,
  DEFAULT_ENGINE,
  type Engine,
  LOG_PATH,
  RAW_CACHE_DIR,
  TRANSCRIPTS_DIR,
} from './config.ts'
import { downloadFile } from './download.ts'
import { createLogger } from './log.ts'
import type { TranscribeDeps } from './pipeline.ts'
import { createFileStore } from './store.ts'
import { FasterWhisperTranscriber, type Transcriber } from './transcriber.ts'
import { WhisperCppTranscriber } from './whispercpp.ts'

export type DefaultDepsOptions = {
  engine?: Engine
  model?: string
  outDir?: string
  // faster-whisper only: batched decoding size, 0 keeps it sequential.
  batchSize?: number
}

export function createTranscriber(
  { engine = DEFAULT_ENGINE, model, batchSize }: DefaultDepsOptions = {},
): Transcriber {
  return engine === 'whisper.cpp'
    ? new WhisperCppTranscriber({ model })
    : new FasterWhisperTranscriber({ model, batchSize })
}

// The production wiring shared by the backfill CLI and `regenerate`.
export function createDefaultDeps(
  options: DefaultDepsOptions = {},
): TranscribeDeps {
  return {
    store: createFileStore(options.outDir ?? TRANSCRIPTS_DIR),
    transcriber: createTranscriber(options),
    download: downloadFile,
    log: createLogger(LOG_PATH),
    audioCacheDir: AUDIO_CACHE_DIR,
    rawCacheDir: RAW_CACHE_DIR,
  }
}

export {
  DEFAULT_ENGINE,
  DEFAULT_MODELS,
  parseCount,
  resolveBatchSize,
  resolveEngine,
  resolveModel,
} from './config.ts'
export type { Engine } from './config.ts'
export { FORMATS, transcriptUrl } from './formats.ts'
export {
  recueEpisode,
  selectPending,
  transcribeEpisode,
  transcribeMissing,
  TranscriberUnavailableError,
  withinDays,
} from './pipeline.ts'
export type { EpisodeResult, TranscribeDeps } from './pipeline.ts'
export { createFileStore, transcriptPath } from './store.ts'
export type { TranscriptStore } from './store.ts'
export type { Transcript, TranscriptSegment } from './types.ts'
