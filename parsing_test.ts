import { assertEquals } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { testDescription } from "./test-xml.ts";
import { parseValuesFromDescription } from "./parsing.ts";

Deno.test(function parseValuesFromDescriptionTest() {
  const { imageUrl, authors, date, recordingUrl } =
    parseValuesFromDescription(testDescription);

  assertEquals(
    imageUrl,
    "https://radiostudent.si/sites/default/files/slike/2023-09-19-odvisno-kako-pogledas-152962.jpg"
  );

  assertEquals(authors, [
    "Domen Mohorič",
    "Mato Žgajner",
    "Rasto Pahor",
    "Tadej Pavković",
  ]);

  assertEquals(date, new Date("2023-09-19T19:00:00Z"));

  assertEquals(
    recordingUrl,
    "https://radiostudent.si/sites/default/files/posnetki/pritiskavec-gold/2023-09-19-pritiskavec-gold-odvisno-kako-pogledas.mp3"
  );
});
