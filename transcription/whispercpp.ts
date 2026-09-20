import { TextLineStream } from 'https://deno.land/std/streams/mod.ts'
import { resolve } from 'https://deno.land/std/path/mod.ts'
import {
  DEFAULT_MODELS,
  WHISPER_CPP_BIN,
  WHISPER_CPP_VAD_MODEL,
  whisperCppModelPath,
} from './config.ts'
import { joinWords } from './formats.ts'
import {
  SidecarError,
  type TranscribeOutput,
  type Transcriber,
  type TranscribeRequest,
} from './transcriber.ts'
import type { RawSegment, TranscriptWord } from './types.ts'

export type WhisperCppOptions = {
  model?: string
  binPath?: string
  modelPath?: string
  vadModelPath?: string
  ffmpegBin?: string
}

const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2
const STDERR_TAIL = 20
const PROGRESS_LINE = /progress\s*=\s*(\d+)%/

// Words further apart than this start a new raw segment.
const PAUSE_SECONDS = 1
const SENTENCE_END = /[.!?…]$/

type CliWord = { offsets: { from: number; to: number }; text: string }
type CliOutput = { result?: { language?: string }; transcription?: CliWord[] }

// Runs the whisper.cpp CLI (built with the Vulkan backend by
// transcription/whispercpp/setup.sh) in per-word mode. The source audio is
// decoded to 16 kHz WAV with ffmpeg first, both because whisper.cpp wants
// that and because ffmpeg copes with the corrupt MP3 frames in the archive.
export class WhisperCppTranscriber implements Transcriber {
  readonly model: string
  private binPath: string
  private modelPath: string
  private vadModelPath: string
  private ffmpegBin: string

  constructor({
    model = DEFAULT_MODELS['whisper.cpp'],
    binPath = WHISPER_CPP_BIN,
    modelPath = whisperCppModelPath(model),
    vadModelPath = WHISPER_CPP_VAD_MODEL,
    ffmpegBin = 'ffmpeg',
  }: WhisperCppOptions = {}) {
    this.model = model
    this.binPath = binPath
    this.modelPath = modelPath
    this.vadModelPath = vadModelPath
    this.ffmpegBin = ffmpegBin
  }

  async transcribe(request: TranscribeRequest): Promise<TranscribeOutput> {
    const wavPath = `${request.audioPath}.16k.wav`
    const outPrefix = `${request.audioPath}.whispercpp`
    try {
      const audioDuration = await this.decode(request.audioPath, wavPath)
      await this.run(wavPath, outPrefix, request, audioDuration)
      const json = await Deno.readTextFile(`${outPrefix}.json`)
      return {
        engine: 'whisper.cpp',
        model: this.model,
        language: parseLanguage(json, request.language),
        audioDuration,
        segments: parseSegments(json),
      }
    } finally {
      await Deno.remove(wavPath).catch(() => {})
      await Deno.remove(`${outPrefix}.json`).catch(() => {})
    }
  }

  private decode(source: string, wavPath: string): Promise<number> {
    return decodeAudio(source, wavPath, this.ffmpegBin)
  }

  private async run(
    wavPath: string,
    outPrefix: string,
    request: TranscribeRequest,
    audioDuration: number,
  ) {
    const child = new Deno.Command(this.binPath, {
      args: [
        '-m',
        this.modelPath,
        '-f',
        resolve(wavPath),
        '-l',
        request.language,
        '-bs',
        '5',
        // No text context between windows: the equivalent of faster-whisper's
        // condition_on_previous_text=False, and what stops repetition loops.
        '-mc',
        '0',
        '--vad',
        '--vad-model',
        this.vadModelPath,
        // One segment per word, so we get word timings on the real timeline.
        '-ml',
        '1',
        '-sow',
        '-oj',
        '-of',
        resolve(outPrefix),
        '-np',
        '-pp',
      ],
      stdin: 'null',
      stdout: 'null',
      stderr: 'piped',
    }).spawn()
    const forwardInterrupt = () => child.kill('SIGINT')
    Deno.addSignalListener('SIGINT', forwardInterrupt)

    try {
      const tail: string[] = []
      const [status] = await Promise.all([
        child.status,
        (async () => {
          const lines = child.stderr
            .pipeThrough(new TextDecoderStream())
            .pipeThrough(new TextLineStream())
          for await (const line of lines) {
            const match = line.match(PROGRESS_LINE)
            if (match) {
              request.onProgress?.({
                processedSeconds: audioDuration * Number(match[1]) / 100,
                totalSeconds: audioDuration,
              })
            } else if (line.trim()) {
              tail.push(line)
              if (tail.length > STDERR_TAIL) tail.shift()
            }
          }
        })(),
      ])
      if (!status.success) throw new SidecarError(status.code, tail)
    } finally {
      Deno.removeSignalListener('SIGINT', forwardInterrupt)
    }
  }
}

// A mono downmix this much quieter than the left channel alone (in RMS) means
// the channels cancelled each other out.
const CANCELLED_RATIO = 0.25

// Decodes any audio file to 16 kHz mono PCM. Returns the duration in seconds.
// Some archive episodes have phase-inverted stereo channels that cancel each
// other out in a mix, so the plain downmix is compared against the left
// channel alone and the louder of the two is kept.
export async function decodeAudio(
  source: string,
  wavPath: string,
  ffmpegBin = 'ffmpeg',
): Promise<number> {
  const leftPath = `${wavPath}.left.wav`
  await runFfmpeg(ffmpegBin, source, wavPath, [])
  await runFfmpeg(ffmpegBin, source, leftPath, ['-af', 'pan=mono|c0=c0'])
  const mixed = wavSamples(await Deno.readFile(wavPath))
  const left = wavSamples(await Deno.readFile(leftPath))
  if (rms(mixed) < rms(left) * CANCELLED_RATIO) {
    console.log(
      '  Mono downmix is much quieter than the left channel (phase-inverted stereo); using the left channel.',
    )
    await Deno.rename(leftPath, wavPath)
    return left.length / SAMPLE_RATE
  }
  await Deno.remove(leftPath)
  return mixed.length / SAMPLE_RATE
}

function rms(samples: Int16Array) {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  return Math.sqrt(sum / samples.length) / 32768
}

async function runFfmpeg(
  ffmpegBin: string,
  source: string,
  wavPath: string,
  filters: string[],
) {
  const { success, stderr } = await new Deno.Command(ffmpegBin, {
    args: [
      '-v',
      'error',
      '-y',
      '-i',
      source,
      ...filters,
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      wavPath,
    ],
    stdout: 'null',
    stderr: 'piped',
  }).output()
  const messages = new TextDecoder().decode(stderr).trim()
  if (!success) {
    throw new Error(`ffmpeg failed to decode "${source}": ${messages}`)
  }
  if (messages) {
    console.log(
      `  ffmpeg reported errors while decoding (continuing): ${messages}`,
    )
  }
}

// The 16-bit samples of a WAV file, located by walking the RIFF chunks (ffmpeg
// adds a metadata chunk, so the data does not start at a fixed offset).
export function wavSamples(wav: Uint8Array): Int16Array {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (offset: number) =>
    String.fromCharCode(...wav.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('Not a WAV file.')
  }
  let offset = 12
  while (offset + 8 <= wav.byteLength) {
    const size = view.getUint32(offset + 4, true)
    if (tag(offset) === 'data') {
      const length = Math.min(size, wav.byteLength - offset - 8)
      return new Int16Array(
        wav.buffer,
        wav.byteOffset + offset + 8,
        Math.floor(length / BYTES_PER_SAMPLE),
      )
    }
    offset += 8 + size + (size % 2)
  }
  throw new Error('WAV file has no data chunk.')
}

function parseLanguage(json: string, fallback: string) {
  const parsed: CliOutput = JSON.parse(json)
  return parsed.result?.language ?? fallback
}

function parseSegments(json: string): RawSegment[] {
  let parsed: CliOutput
  try {
    parsed = JSON.parse(json)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`whisper.cpp produced invalid JSON: ${message}`)
  }
  const words: TranscriptWord[] = (parsed.transcription ?? [])
    .map((item) => ({
      start: item.offsets.from / 1000,
      end: item.offsets.to / 1000,
      word: item.text.trim(),
    }))
    .filter((word) => word.word && !word.word.startsWith('[_'))
  const segments = groupWords(words)
  if (segments.length === 0) {
    throw new Error('whisper.cpp returned no segments.')
  }
  return segments
}

// whisper.cpp's per-word mode loses the natural segments, so rebuild them:
// a new segment starts after sentence-final punctuation or a pause.
export function groupWords(words: TranscriptWord[]): RawSegment[] {
  const segments: RawSegment[] = []
  let current: TranscriptWord[] = []
  const flush = () => {
    if (!current.length) return
    segments.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: joinWords(current.map((w) => w.word)),
      words: current,
    })
    current = []
  }
  for (const word of words) {
    const previous = current[current.length - 1]
    if (previous && word.start - previous.end > PAUSE_SECONDS) flush()
    current.push(word)
    if (SENTENCE_END.test(word.word)) flush()
  }
  flush()
  return segments
}
