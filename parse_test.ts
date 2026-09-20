import {
  assertEquals,
  assertRejects,
} from 'https://deno.land/std/assert/mod.ts'
import { testPostHtml } from './test-xml.ts'
import { fetchContentLength, parseValuesFromPostHtml } from './parse.ts'

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
