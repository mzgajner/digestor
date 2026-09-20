import { TRANSCRIPTS_DIR } from './config.ts'
import type { Transcript } from './types.ts'

export type TranscriptStore = {
  has(guid: string): Promise<boolean>
  // Throws Deno.errors.NotFound when the transcript doesn't exist.
  read(guid: string): Promise<Transcript>
  write(guid: string, transcript: Transcript): Promise<void>
  // Guids of every stored transcript.
  list(): Promise<Set<string>>
}

const FILE_PATTERN = /^(\d+)\.json$/

export function transcriptPath(dir: string, guid: string): string {
  return `${dir}/${guid}.json`
}

export function createFileStore(dir = TRANSCRIPTS_DIR): TranscriptStore {
  return {
    async has(guid) {
      try {
        await Deno.stat(transcriptPath(dir, guid))
        return true
      } catch {
        return false
      }
    },

    async read(guid) {
      return JSON.parse(await Deno.readTextFile(transcriptPath(dir, guid)))
    },

    // Written to a temp file and renamed so an interrupted run never leaves
    // a half-written transcript that would later be mistaken for a finished one.
    async write(guid, transcript) {
      await Deno.mkdir(dir, { recursive: true })
      const path = transcriptPath(dir, guid)
      const temp = `${path}.tmp`
      await Deno.writeTextFile(temp, JSON.stringify(transcript))
      await Deno.rename(temp, path)
    },

    async list() {
      const guids = new Set<string>()
      try {
        for await (const entry of Deno.readDir(dir)) {
          const match = entry.name.match(FILE_PATTERN)
          if (entry.isFile && match) guids.add(match[1])
        }
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error
      }
      return guids
    },
  }
}
