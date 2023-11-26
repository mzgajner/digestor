import { assertEquals } from 'https://deno.land/std@0.202.0/assert/mod.ts'
import { createChunks } from './cache.ts'

Deno.test(function createChunksTest() {
  assertEquals(
    createChunks([1, 2, 3, 4], 1),
    [[1], [2], [3], [4]],
  )

  assertEquals(
    createChunks(['a', 'b', 'c'], 2),
    [['a', 'b'], ['c']],
  )

  assertEquals(
    createChunks([{ a: 'a' }, { b: 'b' }, { c: 'c' }], 10),
    [[{ a: 'a' }, { b: 'b' }, { c: 'c' }]],
  )
})
