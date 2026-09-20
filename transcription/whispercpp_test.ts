import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import { SidecarError } from './transcriber.ts'
import {
  decodeAudio,
  groupWords,
  wavSamples,
  WhisperCppTranscriber,
} from './whispercpp.ts'

// A stand-in whisper-cli: a shell script that records its arguments, prints
// progress like the real binary and writes the JSON file the real one would.
async function fakeWhisperCli(json: string, script = '') {
  const dir = await Deno.makeTempDir()
  const bin = `${dir}/whisper-cli`
  await Deno.writeTextFile(
    bin,
    `#!/bin/sh
echo "$@" > ${dir}/args.txt
echo "whisper_print_progress_callback: progress =  50%" >&2
${script}
out=""
while [ $# -gt 0 ]; do if [ "$1" = "-of" ]; then out="$2"; fi; shift; done
printf '%s' '${json}' > "$out.json"
`,
  )
  await Deno.chmod(bin, 0o755)
  return {
    dir,
    transcriber: new WhisperCppTranscriber({
      binPath: bin,
      modelPath: `${dir}/ggml-large-v3-q5_0.bin`,
      vadModelPath: `${dir}/vad.bin`,
      model: 'large-v3-q5_0',
    }),
  }
}

// Two seconds of silence as a WAV, so the real ffmpeg has something to decode.
async function silentAudio() {
  const dir = await Deno.makeTempDir()
  const path = `${dir}/a.wav`
  const cmd = new Deno.Command('ffmpeg', {
    args: [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=mono',
      '-t',
      '2',
      path,
    ],
  })
  const { success } = await cmd.output()
  if (!success) throw new Error('ffmpeg failed to create test audio')
  return path
}

function word(from: number, to: number, text: string) {
  return { offsets: { from, to }, text }
}

const WORDS_JSON = JSON.stringify({
  result: { language: 'sl' },
  transcription: [
    word(0, 100, ''),
    word(0, 400, ' Živjo'),
    word(400, 900, ' vsem.'),
    word(1000, 1300, ' Danes'),
    word(1300, 1600, ' Game'),
    word(1600, 1700, ' Boy'),
    word(1700, 1900, '-a.'),
  ],
})

Deno.test(async function whisperCppParsesWordsIntoSegmentsTest() {
  const { transcriber } = await fakeWhisperCli(WORDS_JSON)
  const progress: unknown[] = []
  const output = await transcriber.transcribe({
    audioPath: await silentAudio(),
    language: 'sl',
    onProgress: (p) => progress.push(p),
  })
  assertEquals(output.engine, 'whisper.cpp')
  assertEquals(output.model, 'large-v3-q5_0')
  assertEquals(output.language, 'sl')
  assertEquals(Math.round(output.audioDuration), 2)
  assertEquals(output.segments, [
    {
      start: 0,
      end: 0.9,
      text: 'Živjo vsem.',
      words: [
        { start: 0, end: 0.4, word: 'Živjo' },
        { start: 0.4, end: 0.9, word: 'vsem.' },
      ],
    },
    {
      start: 1,
      end: 1.9,
      text: 'Danes Game Boy-a.',
      words: [
        { start: 1, end: 1.3, word: 'Danes' },
        { start: 1.3, end: 1.6, word: 'Game' },
        { start: 1.6, end: 1.7, word: 'Boy' },
        { start: 1.7, end: 1.9, word: '-a.' },
      ],
    },
  ])
  const rounded =
    (progress as { processedSeconds: number; totalSeconds: number }[])
      .map((p) => ({
        processedSeconds: Math.round(p.processedSeconds),
        totalSeconds: Math.round(p.totalSeconds),
      }))
  assertEquals(rounded, [{ processedSeconds: 1, totalSeconds: 2 }])
})

Deno.test(async function whisperCppPassesExpectedArgumentsTest() {
  const { dir, transcriber } = await fakeWhisperCli(WORDS_JSON)
  await transcriber.transcribe({
    audioPath: await silentAudio(),
    language: 'sl',
  })
  const args = await Deno.readTextFile(`${dir}/args.txt`)
  for (
    const expected of [
      `-m ${dir}/ggml-large-v3-q5_0.bin`,
      '-l sl',
      '-mc 0',
      `--vad --vad-model ${dir}/vad.bin`,
      '-ml 1 -sow',
      '-oj',
    ]
  ) {
    assertEquals(
      args.includes(expected),
      true,
      `missing "${expected}" in: ${args}`,
    )
  }
  // The audio handed to whisper-cli is the 16 kHz WAV, not the source file.
  assertEquals(/-f \S+\.16k\.wav/.test(args), true, args)
})

Deno.test(async function whisperCppCleansUpTemporaryFilesTest() {
  const { transcriber } = await fakeWhisperCli(WORDS_JSON)
  const audioPath = await silentAudio()
  await transcriber.transcribe({ audioPath, language: 'sl' })
  const names = []
  for await (const entry of Deno.readDir(audioPath.replace(/\/a\.wav$/, ''))) {
    names.push(entry.name)
  }
  assertEquals(names, ['a.wav'])
})

Deno.test(async function whisperCppFailsOnNonZeroExitTest() {
  const { transcriber } = await fakeWhisperCli(
    WORDS_JSON,
    'echo "boom" >&2; exit 2',
  )
  const audioPath = await silentAudio()
  const error = await assertRejects(
    () => transcriber.transcribe({ audioPath, language: 'sl' }),
    SidecarError,
    'exited with code 2',
  )
  assertEquals(error.message.includes('boom'), true)
})

Deno.test(async function whisperCppFailsWithoutWordsTest() {
  const { transcriber } = await fakeWhisperCli(
    JSON.stringify({
      result: { language: 'sl' },
      transcription: [word(0, 100, ' ')],
    }),
  )
  const audioPath = await silentAudio()
  await assertRejects(
    () => transcriber.transcribe({ audioPath, language: 'sl' }),
    Error,
    'no segments',
  )
})

Deno.test(function groupWordsSplitsOnSentenceEndAndPauseTest() {
  const words = [
    { start: 0, end: 0.5, word: 'Ena' },
    { start: 0.5, end: 1, word: 'dva.' },
    { start: 1, end: 1.5, word: 'Tri' },
    { start: 3, end: 3.5, word: 'štiri' },
  ]
  assertEquals(groupWords(words).map((s) => s.text), [
    'Ena dva.',
    'Tri',
    'štiri',
  ])
})

// A stereo file whose right channel is the left one phase-inverted, like some
// archive episodes: a naive mono downmix cancels it to silence.
async function phaseInvertedAudio() {
  const dir = await Deno.makeTempDir()
  const path = `${dir}/inverted.wav`
  const { success } = await new Deno.Command('ffmpeg', {
    args: [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=4',
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=duration=4:amplitude=0.06:seed=1',
      // Left: tone. Right: inverted tone plus a bit of noise, so the mix is
      // not perfectly silent, just useless.
      '-filter_complex',
      '[0:a]volume=6[t];[t][1:a]amerge=inputs=2,pan=stereo|c0=c0|c1=-1*c0+c1[out]',
      '-map',
      '[out]',
      path,
    ],
  }).output()
  if (!success) throw new Error('ffmpeg failed to create phase-inverted audio')
  return path
}

function peakAmplitude(wav: Uint8Array) {
  let peak = 0
  for (const sample of wavSamples(wav)) peak = Math.max(peak, Math.abs(sample))
  return peak / 32768
}

Deno.test(async function decodeAudioSurvivesPhaseInvertedStereoTest() {
  const source = await phaseInvertedAudio()
  const dest = `${source}.16k.wav`
  const seconds = await decodeAudio(source, dest)
  assertEquals(Math.round(seconds), 4)
  const peak = peakAmplitude(await Deno.readFile(dest))
  assertEquals(
    peak > 0.1,
    true,
    `peak ${peak}: the downmix cancelled the audio`,
  )
})
