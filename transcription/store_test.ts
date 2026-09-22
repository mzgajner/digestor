import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import { createFileStore, transcriptPath } from './store.ts'
import type { Transcript } from './types.ts'

const sample: Transcript = {
  version: 1,
  guid: '26613',
  title: 'Pilot',
  audioUrl: 'https://example.com/a.mp3',
  audioDuration: 60,
  language: 'sl',
  engine: 'faster-whisper',
  model: 'large-v3',
  createdAt: '2026-09-13T10:00:00.000Z',
  wallSeconds: 30,
  segments: [{ start: 0, end: 1, text: 'hej' }],
}

Deno.test(async function storeWriteReadHasTest() {
  const dir = await Deno.makeTempDir()
  const store = createFileStore(dir)

  assertEquals(await store.has('26613'), false)
  await store.write('26613', sample)
  assertEquals(await store.has('26613'), true)
  assertEquals(await store.read('26613'), sample)
  await assertRejects(() => store.read('1'), Deno.errors.NotFound)
})

Deno.test(async function storeCreatesMissingDirectoryTest() {
  const dir = `${await Deno.makeTempDir()}/nested/transcripts`
  const store = createFileStore(dir)
  await store.write('26613', sample)
  assertEquals(await store.has('26613'), true)
})

Deno.test(async function storeListIgnoresPartialFilesTest() {
  const dir = await Deno.makeTempDir()
  const store = createFileStore(dir)
  await store.write('26613', sample)
  await store.write('30000', { ...sample, guid: '30000' })
  await Deno.writeTextFile(`${dir}/40000.json.tmp`, '{')
  await Deno.writeTextFile(`${dir}/notes.txt`, '')
  assertEquals(await store.list(), new Set(['26613', '30000']))
})

Deno.test(async function storeLeavesNoTempFileBehindTest() {
  const dir = await Deno.makeTempDir()
  const store = createFileStore(dir)
  await store.write('26613', sample)
  const names = []
  for await (const entry of Deno.readDir(dir)) names.push(entry.name)
  assertEquals(names, ['26613.json'])
})

Deno.test(function transcriptPathTest() {
  assertEquals(transcriptPath('transcripts', '26613'), 'transcripts/26613.json')
})
