import { assertEquals } from 'https://deno.land/std/assert/mod.ts'
import {
  convertBytesToSeconds,
  generateHumanReadableAuthors,
  getLastName,
} from './utils.ts'

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

Deno.test(function convertBytesToSecondsTest() {
  assertEquals(convertBytesToSeconds(0, 192), 0)
  assertEquals(convertBytesToSeconds(1200000, 320), 30)
  assertEquals(convertBytesToSeconds(1200000, 128), 75)
  assertEquals(convertBytesToSeconds(142407052, 320), 3560)
})

Deno.test(function getLastNameTest() {
  assertEquals(getLastName('Janez Janša'), 'Janša')
  assertEquals(getLastName('Jean Claude Van Damme'), 'Damme')
  assertEquals(getLastName(''), '')
})
