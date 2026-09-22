import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import { FasterWhisperTranscriber, SidecarError } from './transcriber.ts'

// A stand-in for `uv` that ignores its arguments and runs a shell snippet, so
// the spawning, stream parsing and error handling get exercised for real.
async function fakeUv(script: string) {
  const dir = await Deno.makeTempDir()
  const path = `${dir}/uv`
  await Deno.writeTextFile(path, `#!/bin/sh\n${script}\n`)
  await Deno.chmod(path, 0o755)
  return new FasterWhisperTranscriber({
    model: 'tiny',
    sidecarDir: dir,
    uvBin: path,
  })
}

const OK_JSON =
  '{"engine":"faster-whisper","model":"tiny","language":"sl","duration":60,"segments":[{"start":0,"end":1,"text":"hej","words":[]}]}'

Deno.test(async function transcriberParsesOutputAndProgressTest() {
  const transcriber = await fakeUv(
    `echo "duration 60" >&2; echo "progress 30 60" >&2; echo "noise" >&2; printf '%s' '${OK_JSON}'`,
  )
  const progress: unknown[] = []
  const output = await transcriber.transcribe({
    audioPath: 'x.mp3',
    language: 'sl',
    onProgress: (p) => progress.push(p),
  })
  assertEquals(output.audioDuration, 60)
  assertEquals(output.model, 'tiny')
  assertEquals(output.segments, [{ start: 0, end: 1, text: 'hej', words: [] }])
  assertEquals(progress, [{ processedSeconds: 30, totalSeconds: 60 }])
})

Deno.test(async function transcriberPassesModelAndAudioPathTest() {
  const transcriber = await fakeUv(`echo "$@" >&2; printf '%s' '${OK_JSON}'`)
  const lines: string[] = []
  const original = console.log
  console.log = (line: string) => lines.push(line)
  try {
    await transcriber.transcribe({ audioPath: 'x.mp3', language: 'sl' })
  } finally {
    console.log = original
  }
  const args = lines.join('\n')
  assertEquals(args.includes('--model tiny'), true)
  assertEquals(args.includes('--language sl'), true)
  assertEquals(args.includes(`${Deno.cwd()}/x.mp3`), true)
  assertEquals(args.includes('transcribe.py'), true)
})

Deno.test(async function transcriberFailsOnNonZeroExitWithStderrTailTest() {
  const transcriber = await fakeUv(
    `echo "Traceback" >&2; echo "boom" >&2; exit 3`,
  )
  const error = await assertRejects(
    () => transcriber.transcribe({ audioPath: 'x.mp3', language: 'sl' }),
    SidecarError,
    'exited with code 3',
  )
  assertEquals(error.message.includes('boom'), true)
})

Deno.test(async function transcriberFailsOnInvalidJsonTest() {
  const transcriber = await fakeUv(`printf '{"segments":['`)
  await assertRejects(
    () => transcriber.transcribe({ audioPath: 'x.mp3', language: 'sl' }),
    Error,
    'invalid JSON',
  )
})

Deno.test(async function transcriberFailsOnNoSegmentsTest() {
  const transcriber = await fakeUv(
    `printf '%s' '{"engine":"x","model":"tiny","language":"sl","duration":1,"segments":[]}'`,
  )
  await assertRejects(
    () => transcriber.transcribe({ audioPath: 'x.mp3', language: 'sl' }),
    Error,
    'no segments',
  )
})
