import { assertEquals, assertThrows } from 'https://deno.land/std/assert/mod.ts'
import {
  parseCount,
  resolveBatchSize,
  resolveEngine,
  resolveModel,
} from './config.ts'

Deno.test(function resolveEngineDefaultsToWhisperCppTest() {
  assertEquals(resolveEngine([]), 'whisper.cpp')
  assertEquals(resolveEngine(['--engine', 'faster-whisper']), 'faster-whisper')
})

Deno.test(function resolveModelDefaultsPerEngineTest() {
  assertEquals(resolveModel([], 'whisper.cpp'), 'large-v3-q5_0')
  assertEquals(resolveModel([], 'faster-whisper'), 'large-v3')
  assertEquals(resolveModel(['--model', 'tiny'], 'whisper.cpp'), 'tiny')
})

Deno.test(function resolveTreatsEmptyEnvAsUnsetTest() {
  // An unset GitHub Actions variable reaches the process as an empty string.
  Deno.env.set('TRANSCRIBE_ENGINE', '')
  Deno.env.set('TRANSCRIBE_MODEL', '')
  try {
    assertEquals(resolveEngine([]), 'whisper.cpp')
    assertEquals(resolveModel([], 'faster-whisper'), 'large-v3')
  } finally {
    Deno.env.delete('TRANSCRIBE_ENGINE')
    Deno.env.delete('TRANSCRIBE_MODEL')
  }
})

Deno.test(function resolveBatchSizeTest() {
  assertEquals(resolveBatchSize([]), undefined)
  assertEquals(resolveBatchSize(['--batch-size', '8']), 8)
  Deno.env.set('TRANSCRIBE_BATCH_SIZE', '4')
  try {
    assertEquals(resolveBatchSize([]), 4)
    assertEquals(resolveBatchSize(['--batch-size', '2']), 2)
    Deno.env.set('TRANSCRIBE_BATCH_SIZE', '')
    assertEquals(resolveBatchSize([]), undefined)
  } finally {
    Deno.env.delete('TRANSCRIBE_BATCH_SIZE')
  }
  assertThrows(
    () => resolveBatchSize(['--batch-size', 'lots']),
    Error,
    'Invalid batch size',
  )
})

Deno.test(function resolveAcceptsEqualsFormTest() {
  assertEquals(resolveEngine(['--engine=faster-whisper']), 'faster-whisper')
  assertEquals(resolveModel(['--model=tiny'], 'whisper.cpp'), 'tiny')
  assertEquals(resolveBatchSize(['--batch-size=4']), 4)
})

Deno.test(function parseCountTest() {
  assertEquals(parseCount('--limit', undefined), undefined)
  assertEquals(parseCount('--limit', '5'), 5)
  assertThrows(
    () => parseCount('--limit', 'abc'),
    Error,
    'Invalid --limit "abc"',
  )
  assertThrows(() => parseCount('--limit', '-1'), Error, 'Invalid --limit')
  assertThrows(
    () => parseCount('--max-age-days', '1.5'),
    Error,
    'Invalid --max-age-days',
  )
})
