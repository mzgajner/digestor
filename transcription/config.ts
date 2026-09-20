export type Engine = 'whisper.cpp' | 'faster-whisper'

// whisper.cpp on the Vulkan iGPU won the pilot; faster-whisper stays as the
// CPU fallback (`--engine faster-whisper`).
export const DEFAULT_ENGINE: Engine = 'whisper.cpp'

export const DEFAULT_MODELS: Record<Engine, string> = {
  'whisper.cpp': 'large-v3-q5_0',
  'faster-whisper': 'large-v3',
}

export const LANGUAGE = 'sl'

// Committed transcript data, one JSON per episode guid.
export const TRANSCRIPTS_DIR = 'transcripts'

// Scratch space for downloaded audio, raw sidecar output and the run log.
export const CACHE_DIR = '.cache'
export const AUDIO_CACHE_DIR = `${CACHE_DIR}/audio`
export const RAW_CACHE_DIR = `${CACHE_DIR}/raw`
export const LOG_PATH = `${CACHE_DIR}/transcribe.log`

// Python sidecar for faster-whisper.
export const SIDECAR_DIR = new URL('./sidecar/', import.meta.url).pathname

// whisper.cpp checkout built by transcription/whispercpp/setup.sh.
export const WHISPER_CPP_DIR = `${CACHE_DIR}/whisper.cpp`
export const WHISPER_CPP_BIN = `${WHISPER_CPP_DIR}/build/bin/whisper-cli`
export const WHISPER_CPP_VAD_MODEL =
  `${WHISPER_CPP_DIR}/models/ggml-silero-v5.1.2.bin`
export function whisperCppModelPath(model: string) {
  return `${WHISPER_CPP_DIR}/models/ggml-${model}.bin`
}

export const PUBLIC_BASE_URL = 'https://pritiskavec.z0.si'

function flag(args: string[], name: string) {
  const index = args.indexOf(name)
  return index !== -1 ? args[index + 1] : undefined
}

// Empty values count as unset throughout: an unset GitHub Actions variable
// reaches the process as an empty string.

// Engine precedence: --engine flag, then TRANSCRIBE_ENGINE env, then default.
export function resolveEngine(args: string[]): Engine {
  const value = flag(args, '--engine') || Deno.env.get('TRANSCRIBE_ENGINE')
  if (!value) return DEFAULT_ENGINE
  if (value in DEFAULT_MODELS) return value as Engine
  throw new Error(
    `Unknown engine "${value}"; expected one of ${
      Object.keys(DEFAULT_MODELS).join(', ')
    }.`,
  )
}

// Model precedence: --model flag, then TRANSCRIBE_MODEL env, then the engine's default.
export function resolveModel(args: string[], engine: Engine): string {
  return flag(args, '--model') || Deno.env.get('TRANSCRIBE_MODEL') ||
    DEFAULT_MODELS[engine]
}

// Batch size precedence: --batch-size flag, then TRANSCRIBE_BATCH_SIZE env.
// Only faster-whisper uses it; undefined keeps sequential decoding.
export function resolveBatchSize(args: string[]): number | undefined {
  const value = flag(args, '--batch-size') ||
    Deno.env.get('TRANSCRIBE_BATCH_SIZE')
  if (!value) return undefined
  const size = Number(value)
  if (!Number.isInteger(size) || size < 0) {
    throw new Error(`Invalid batch size "${value}".`)
  }
  return size
}
