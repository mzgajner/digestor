import { TextLineStream } from 'https://deno.land/std/streams/mod.ts'
import { join, resolve } from 'https://deno.land/std/path/mod.ts'
import { DEFAULT_MODELS, SIDECAR_DIR } from './config.ts'
import type { RawSegment } from './types.ts'

export type Progress = { processedSeconds: number; totalSeconds: number }

export type TranscribeRequest = {
  audioPath: string
  language: string
  onProgress?: (progress: Progress) => void
}

export type TranscribeOutput = {
  engine: string
  model: string
  language: string
  audioDuration: number
  segments: RawSegment[]
}

// Anything that turns an audio file into timed segments. The sidecar below is
// the only implementation for now; diarization or a different model can be
// plugged in behind this without touching the pipeline.
export interface Transcriber {
  readonly model: string
  // Optional cheap check that the engine can run at all (binary built, models
  // present). Rejects with a message that says how to fix it.
  preflight?(): Promise<void>
  transcribe(request: TranscribeRequest): Promise<TranscribeOutput>
}

export class SidecarError extends Error {
  constructor(public code: number, stderrTail: string[]) {
    super(
      `Sidecar exited with code ${code}.${
        stderrTail.length ? `\n${stderrTail.join('\n')}` : ''
      }`,
    )
    this.name = 'SidecarError'
  }
}

export type FasterWhisperOptions = {
  model?: string
  sidecarDir?: string
  uvBin?: string
  // Passed to the sidecar's --batch-size; 0 keeps sequential decoding.
  batchSize?: number
}

// Number of trailing stderr lines kept for error messages.
const STDERR_TAIL = 20

// Runs transcription/sidecar/transcribe.py through uv and parses its output.
export class FasterWhisperTranscriber implements Transcriber {
  readonly model: string
  private sidecarDir: string
  private uvBin: string
  private batchSize: number

  constructor({
    model = DEFAULT_MODELS['faster-whisper'],
    sidecarDir = SIDECAR_DIR,
    uvBin = 'uv',
    batchSize = 0,
  }: FasterWhisperOptions = {}) {
    this.model = model
    this.sidecarDir = sidecarDir
    this.uvBin = uvBin
    this.batchSize = batchSize
  }

  async transcribe(request: TranscribeRequest): Promise<TranscribeOutput> {
    const command = new Deno.Command(this.uvBin, {
      args: [
        'run',
        '--project',
        this.sidecarDir,
        'python',
        join(this.sidecarDir, 'transcribe.py'),
        '--model',
        this.model,
        '--language',
        request.language,
        '--batch-size',
        String(this.batchSize),
        resolve(request.audioPath),
      ],
      env: { PYTHONUNBUFFERED: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1' },
      stdin: 'null',
      stdout: 'piped',
      stderr: 'piped',
    })

    const child = command.spawn()
    const forwardInterrupt = () => child.kill('SIGINT')
    Deno.addSignalListener('SIGINT', forwardInterrupt)

    try {
      const tail: string[] = []
      let totalSeconds = 0
      const [stdout, status] = await Promise.all([
        new Response(child.stdout).text(),
        child.status,
        (async () => {
          const lines = child.stderr
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new TextLineStream())
          for await (const line of lines) {
            const [keyword, ...rest] = line.trim().split(/\s+/)
            if (keyword === 'duration') {
              totalSeconds = Number(rest[0])
            } else if (keyword === 'progress') {
              request.onProgress?.({
                processedSeconds: Number(rest[0]),
                totalSeconds: Number(rest[1]) || totalSeconds,
              })
            } else if (line.trim()) {
              console.log(`  sidecar: ${line}`)
              tail.push(line)
              if (tail.length > STDERR_TAIL) tail.shift()
            }
          }
        })(),
      ])

      if (!status.success) throw new SidecarError(status.code, tail)
      return parseOutput(stdout)
    } finally {
      Deno.removeSignalListener('SIGINT', forwardInterrupt)
    }
  }
}

function parseOutput(stdout: string): TranscribeOutput {
  type SidecarJson = Partial<Omit<TranscribeOutput, 'audioDuration'>> & {
    duration?: number
  }
  let parsed: SidecarJson
  try {
    parsed = JSON.parse(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Sidecar produced invalid JSON: ${message}`)
  }

  const segments = parsed.segments
  if (!Array.isArray(segments)) {
    throw new Error('Sidecar output is missing the segments array.')
  }
  if (segments.length === 0) throw new Error('Sidecar returned no segments.')
  for (const segment of segments) {
    if (
      typeof segment.start !== 'number' || typeof segment.end !== 'number' ||
      typeof segment.text !== 'string'
    ) {
      throw new Error('Sidecar returned a malformed segment.')
    }
  }

  return {
    engine: String(parsed.engine ?? 'faster-whisper'),
    model: String(parsed.model ?? ''),
    language: String(parsed.language ?? ''),
    audioDuration: Number(parsed.duration ?? 0),
    segments,
  }
}
