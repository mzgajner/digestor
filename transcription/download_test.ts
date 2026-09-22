import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import { USER_AGENT } from '../utils.ts'
import { downloadFile } from './download.ts'

function serve(handler: (request: Request) => Response) {
  const server = Deno.serve({ port: 0, onListen() {} }, handler)
  const { port } = server.addr as Deno.NetAddr
  return {
    url: `http://localhost:${port}/a.mp3`,
    close: () => server.shutdown(),
  }
}

Deno.test(async function downloadFileWritesBodyTest() {
  const { url, close } = serve(() => new Response('hello'))
  const dest = `${await Deno.makeTempDir()}/a.mp3`
  try {
    await downloadFile(url, dest, { expectedSize: 5 })
    assertEquals(await Deno.readTextFile(dest), 'hello')
    const names = []
    for await (const entry of Deno.readDir(dest.replace('/a.mp3', ''))) {
      names.push(entry.name)
    }
    assertEquals(names, ['a.mp3'])
  } finally {
    await close()
  }
})

Deno.test(async function downloadFileReusesCompleteFileTest() {
  let requests = 0
  const { url, close } = serve(() => {
    requests++
    return new Response('hello')
  })
  const dest = `${await Deno.makeTempDir()}/a.mp3`
  try {
    await Deno.writeTextFile(dest, 'hello')
    await downloadFile(url, dest, { expectedSize: 5 })
    assertEquals(requests, 0)
  } finally {
    await close()
  }
})

Deno.test(async function downloadFileRetriesAndFailsOnBadStatusTest() {
  let requests = 0
  const { url, close } = serve(() => {
    requests++
    return new Response(null, { status: 503 })
  })
  const dest = `${await Deno.makeTempDir()}/a.mp3`
  try {
    await assertRejects(
      () => downloadFile(url, dest, { attempts: 2 }),
      Error,
      'after 2 attempts: HTTP 503',
    )
    assertEquals(requests, 2)
  } finally {
    await close()
  }
})

Deno.test(async function downloadFileRejectsSizeMismatchTest() {
  const { url, close } = serve(() => new Response('hello'))
  const dest = `${await Deno.makeTempDir()}/a.mp3`
  try {
    await assertRejects(
      () => downloadFile(url, dest, { expectedSize: 99, attempts: 1 }),
      Error,
      'expected 99 bytes, got 5',
    )
  } finally {
    await close()
  }
})

Deno.test(async function downloadFileIdentifiesItselfTest() {
  let userAgent: string | null = null
  const { url, close } = serve((request) => {
    userAgent = request.headers.get('user-agent')
    return new Response('hello')
  })
  const dest = `${await Deno.makeTempDir()}/a.mp3`
  try {
    await downloadFile(url, dest)
    assertEquals(userAgent, USER_AGENT)
  } finally {
    await close()
  }
})
