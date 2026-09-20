import { PUBLIC_BASE_URL } from './config.ts'
import type { RawSegment, Transcript, TranscriptSegment } from './types.ts'

export type CueOptions = {
  // Longest cue text, in characters.
  maxChars?: number
  // Longest cue, in seconds.
  maxSeconds?: number
  // A gap between two words longer than this starts a new cue.
  pauseSeconds?: number
}

const DEFAULT_CUE_OPTIONS: Required<CueOptions> = {
  maxChars: 80,
  maxSeconds: 7,
  pauseSeconds: 1,
}

// Shortest cue we ever emit, so a one-word cue is still readable.
const MIN_CUE_SECONDS = 0.2

const SENTENCE_END = /[.!?…]$/

// Whisper splits "Boy-a" into the words "Boy" and "-a", and "4,9" into "4"
// and ",9"; a piece starting with such punctuation glues back onto the
// previous word.
const GLUED_SUFFIX = /^[-,.:;!?)]/

// Joins word texts with spaces, except for glued suffixes.
export function joinWords(words: string[]): string {
  return words.reduce(
    (text, word) => text + (text && !GLUED_SUFFIX.test(word) ? ' ' : '') + word,
    '',
  )
}

// Splits whisper segments into readable, subtitle-sized cues. Cues never span
// two input segments, so speaker boundaries (once we have them) stay intact.
export function buildCues(
  segments: RawSegment[],
  options: CueOptions = {},
): TranscriptSegment[] {
  const config = { ...DEFAULT_CUE_OPTIONS, ...options }
  const cues = segments.flatMap((segment) =>
    segment.words?.length
      ? splitByWords(segment, config)
      : splitByText(segment, config)
  )
  return cleanUp(cues, config.maxSeconds)
}

function splitByWords(
  segment: RawSegment,
  { maxChars, maxSeconds, pauseSeconds }: Required<CueOptions>,
): TranscriptSegment[] {
  const cues: TranscriptSegment[] = []
  let current: TranscriptSegment | null = null
  let previousEnd = 0

  for (const word of segment.words!) {
    const text = word.word.trim()
    if (!text) continue

    const glued = GLUED_SUFFIX.test(text)

    if (current && !glued) {
      const tooLong = current.text.length + 1 + text.length > maxChars
      const tooSlow = word.end - current.start > maxSeconds
      const pause = word.start - previousEnd > pauseSeconds
      const sentenceEnd = current.text.length >= maxChars / 2 &&
        SENTENCE_END.test(current.text)
      if (tooLong || tooSlow || pause || sentenceEnd) {
        cues.push(current)
        current = null
      }
    }

    if (current) {
      current.text += glued ? text : ` ${text}`
      current.end = word.end
    } else {
      current = withSpeaker({ start: word.start, end: word.end, text }, segment)
    }
    previousEnd = word.end
  }

  if (current) cues.push(current)
  return cues
}

// Without word timings we can only chunk the text and spread the segment's
// time span proportionally to the length of each chunk.
function splitByText(
  segment: RawSegment,
  { maxChars }: Required<CueOptions>,
): TranscriptSegment[] {
  const words = segment.text.split(/\s+/).filter(Boolean)
  const chunks: string[] = []
  for (const word of words) {
    const last = chunks[chunks.length - 1]
    if (last !== undefined && last.length + 1 + word.length <= maxChars) {
      chunks[chunks.length - 1] = `${last} ${word}`
    } else {
      chunks.push(word)
    }
  }

  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const duration = segment.end - segment.start
  let start = segment.start
  return chunks.map((text, index) => {
    const end = index === chunks.length - 1
      ? segment.end
      : start + duration * (text.length / totalChars)
    const cue = withSpeaker({ start, end, text }, segment)
    start = end
    return cue
  })
}

function withSpeaker(
  cue: TranscriptSegment,
  segment: RawSegment,
): TranscriptSegment {
  return segment.speaker ? { ...cue, speaker: segment.speaker } : cue
}

// Normalises text, drops empty cues, caps runaway durations (a word timed
// across a music break) and makes timings monotonic so SRT players (which
// dislike overlaps) behave.
function cleanUp(
  cues: TranscriptSegment[],
  maxSeconds: number,
): TranscriptSegment[] {
  const result: TranscriptSegment[] = []
  let previousEnd = 0
  for (const cue of cues) {
    const text = cue.text.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const start = round(Math.max(cue.start, previousEnd))
    const end = round(
      Math.max(Math.min(cue.end, start + maxSeconds), start + MIN_CUE_SECONDS),
    )
    result.push({ ...cue, start, end, text })
    previousEnd = end
  }
  return result
}

function round(seconds: number) {
  return Math.round(seconds * 1000) / 1000
}

// Breaks a cue into at most two lines at the space closest to the middle.
export function wrapLines(text: string, maxLineChars = 42): string {
  if (text.length <= maxLineChars) return text
  const middle = text.length / 2
  let best = -1
  for (let i = text.indexOf(' '); i !== -1; i = text.indexOf(' ', i + 1)) {
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i
  }
  if (best === -1) return text
  return `${text.slice(0, best)}\n${text.slice(best + 1)}`
}

export function formatVttTimestamp(seconds: number): string {
  return formatTimestamp(seconds, '.')
}

export function formatSrtTimestamp(seconds: number): string {
  return formatTimestamp(seconds, ',')
}

function formatTimestamp(seconds: number, separator: string) {
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`
}

function escapeVtt(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function toVtt(transcript: Transcript): string {
  const cues = transcript.segments.map((cue) => {
    const voice = cue.speaker ? `<v ${escapeVtt(cue.speaker)}>` : ''
    return [
      `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}`,
      voice + wrapLines(escapeVtt(cue.text)),
    ].join('\n')
  })
  return ['WEBVTT', '', ...cues.flatMap((cue) => [cue, ''])].join('\n')
}

export function toSrt(transcript: Transcript): string {
  const cues = transcript.segments.map((cue, index) => {
    const prefix = cue.speaker ? `${cue.speaker}: ` : ''
    return [
      String(index + 1),
      `${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}`,
      wrapLines(prefix + cue.text),
    ].join('\n')
  })
  return cues.flatMap((cue) => [cue, '']).join('\n')
}

// The Podcast Index JSON transcript format.
// https://github.com/Podcastindex-org/podcast-namespace/blob/main/transcripts/transcripts.md
export function toPodcastJson(transcript: Transcript): string {
  const segments = transcript.segments.map((cue) => ({
    ...(cue.speaker ? { speaker: cue.speaker } : {}),
    startTime: cue.start,
    endTime: cue.end,
    body: cue.text,
  }))
  return JSON.stringify({ version: '1.0.0', segments })
}

export type TranscriptFormat = {
  extension: string
  mimeType: string
  render: (transcript: Transcript) => string
}

// Single source of truth for feed tag order (VTT first, since Apple, Pocket
// Casts and Overcast prefer it), MIME types and server routing.
export const FORMATS: readonly TranscriptFormat[] = [
  { extension: 'vtt', mimeType: 'text/vtt', render: toVtt },
  { extension: 'srt', mimeType: 'application/x-subrip', render: toSrt },
  { extension: 'json', mimeType: 'application/json', render: toPodcastJson },
]

export function transcriptUrl(
  guid: string,
  extension: string,
  baseUrl = PUBLIC_BASE_URL,
): string {
  return `${baseUrl}/podcast/transcripts/${guid}.${extension}`
}
