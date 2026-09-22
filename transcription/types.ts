export type TranscriptWord = { start: number; end: number; word: string }

// Raw sidecar output: whisper segments with optional word timings.
export type RawSegment = {
  start: number
  end: number
  text: string
  speaker?: string
  words?: TranscriptWord[]
}

// What we commit: cue-sized segments, speaker reserved for diarization.
export type TranscriptSegment = {
  start: number
  end: number
  text: string
  speaker?: string
}

export type Transcript = {
  version: 1
  guid: string
  title: string
  audioUrl: string
  audioDuration: number
  language: string
  engine: string
  model: string
  createdAt: string
  wallSeconds: number
  segments: TranscriptSegment[]
}
