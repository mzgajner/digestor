import { assertEquals } from "https://deno.land/std@0.202.0/assert/mod.ts";
import { testPostHtml } from "./test-xml.ts";
import { parseValuesFromPost } from "./parse.ts";

Deno.test(function parseValuesFromPostTest() {
  const { imageUrl, authors, description } = parseValuesFromPost(testPostHtml);

  assertEquals(
    imageUrl,
    "https://radiostudent.si/sites/default/files/slike/2023-09-19-odvisno-kako-pogledas-152962.jpg",
  );

  assertEquals(authors, [
    "Domen Mohorič",
    "Mato Žgajner",
    "Rasto Pahor",
    "Tadej Pavković",
  ]);

  assertEquals(
    description,
    "<p>Kolegica iz kulturne redakcije je nedavno namenila kritičen pogled <a" +
      ' href="https://radiostudent.si/kultura/pritiskavec/odkrivanje-novih-pogl' +
      'edov" target="_blank">Viewfinderju</a>, zato smo se odločili, da zajaham' +
      "o širši trend in spregovorimo o igrah, ki se poigravajo s perspektivo te" +
      "r jo uporabljajo ne samo v grafiki, ampak tudi kot igralno mehaniko.</p>\n",
  );
});
