import { assertEquals } from 'https://deno.land/std@0.202.0/assert/mod.ts'
import { generateHumanReadableAuthors, getLastName } from './utils.ts'

Deno.test(function generateHumanReadableAuthorsTest() {
  assertEquals(
    generateHumanReadableAuthors([]),
    undefined,
  )

  assertEquals(
    generateHumanReadableAuthors(['Zlatko Zahović']),
    'Zlatko Zahović',
  )

  assertEquals(
    generateHumanReadableAuthors(['Miha Šalehar', 'Andrej Karoli']),
    'Miha Šalehar in Andrej Karoli',
  )

  assertEquals(
    generateHumanReadableAuthors(['Čiko', 'Pajo', 'Pako']),
    'Čiko, Pajo in Pako',
  )

  assertEquals(
    generateHumanReadableAuthors([
      'Domen Mohorič',
      'Mato Žgajner',
      'Rasto Pahor',
      'Tadej Pavković',
    ]),
    'Domen Mohorič, Mato Žgajner, Rasto Pahor in Tadej Pavković',
  )
})

Deno.test(function getLastNameTest() {
  assertEquals(getLastName('Janez Janša'), 'Janša')
  assertEquals(getLastName('Jean Claude Van Damme'), 'Damme')
  assertEquals(getLastName(''), '')
})
