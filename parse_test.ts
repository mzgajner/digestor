import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import { testPostHtml } from './test-xml.ts'
import {
  fetchContentLength,
  parseEntries,
  parseValuesFromPostHtml,
} from './parse.ts'

Deno.test(function parseValuesFromPostHtmlTest() {
  const { imageUrl, authors, description } = parseValuesFromPostHtml(
    testPostHtml,
  )

  assertEquals(
    imageUrl,
    'https://indiere.radiostudent.si/sites/default/files/slike/2023-09-19-odvisno-kako-pogledas-152962.jpg',
  )

  assertEquals(authors, [
    'Domen Mohorič',
    'Rasto Pahor',
    'Tadej Pavković',
    'Mato Žgajner',
  ])

  assertEquals(
    description,
    '<p>Kolegica iz kulturne redakcije je nedavno namenila kritičen pogled <a' +
      ' href="https://radiostudent.si/kultura/pritiskavec/odkrivanje-novih-pogl' +
      'edov" target="_blank">Viewfinderju</a>, zato smo se odločili, da zajaham' +
      'o širši trend in spregovorimo o igrah, ki se poigravajo s perspektivo te' +
      'r jo uporabljajo ne samo v grafiki, ampak tudi kot igralno mehaniko.</p>\n',
  )
})

Deno.test(async function fetchContentLengthReturnsSizeTest() {
  const fetchFn = () =>
    Promise.resolve(
      new Response(null, { headers: { 'content-length': '1234' } }),
    )
  assertEquals(
    await fetchContentLength('https://example.com/a.mp3', fetchFn),
    1234,
  )
})

Deno.test(async function fetchContentLengthFailsOnErrorStatusTest() {
  const fetchFn = () => Promise.resolve(new Response(null, { status: 404 }))
  await assertRejects(
    () => fetchContentLength('https://example.com/a.mp3', fetchFn),
    Error,
    'HTTP 404',
  )
})

Deno.test(async function fetchContentLengthFailsOnMissingSizeTest() {
  const fetchFn = () => Promise.resolve(new Response(null))
  await assertRejects(
    () => fetchContentLength('https://example.com/a.mp3', fetchFn),
    Error,
    'no content length',
  )
})

Deno.test(async function parseEntriesReportsNewEpisodesItGaveUpOnTest() {
  const known = {
    imageUrl: '',
    authors: ['A'],
    description: undefined,
    subtitle: undefined,
    date: new Date('2026-01-01T00:00:00Z'),
    enclosure: { url: 'https://example.com/known.mp3', size: 1 },
    duration: 60,
    url: 'https://example.com/known',
    guid: '1',
    title: 'Known',
  }
  const gaveUpOn: string[] = []
  const entries = await parseEntries(
    ['https://example.com/new', 'https://example.com/known'],
    {
      existing: new Map([[known.url, known]]),
      // Every fetch fails: the new episode is lost, the known one is reused.
      transform: () => Promise.resolve(null),
      onGiveUp: (url) => gaveUpOn.push(url),
    },
  )
  assertEquals(entries.map((entry) => entry.url), ['https://example.com/known'])
  assertEquals(gaveUpOn, ['https://example.com/new'])
})
