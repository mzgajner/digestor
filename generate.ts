import { Feed } from "npm:feed-media";
import { type ParsedEntry } from "./parse.ts";

const RS_LOGO_URL = "https://small-dragonfly-27.deno.dev/logo.png";

export function generateFeed(entries: ParsedEntry[]) {
  const feed = new Feed({
    title: "Pritiskavec Gold",
    description:
      "Radijska oddaja o računalniških igrah in z njimi povezanimi družbenimi fenomeni",
    id: "https://radiostudent.si/kultura/pritiskavec-gold",
    link: "https://radiostudent.si/kultura/pritiskavec-gold",
    language: "sl",
    image: RS_LOGO_URL,
    favicon: "https://radiostudent.si/sites/all/themes/eresh_lime/favicon.ico",
    copyright: "Radio Študent, 2023",
    updated: new Date(2013, 6, 14),
    generator: "mzgajner/digestor",
    author: { name: "Ekipa Pritiskavca" },
  });
  feed.options.podcast = true;

  feed.addCategory("Video Games");

  feed.addContributor({
    name: "Domen Mohorič",
    link: "https://radiostudent.si/ljudje/domen-mohorič",
  });
  feed.addContributor({
    name: "Mato Žgajner",
    link: "https://radiostudent.si/ljudje/mato-žgajner",
  });
  feed.addContributor({
    name: "Rasto Pahor",
    link: "https://radiostudent.si/ljudje/rasto-pahor",
  });
  feed.addContributor({
    name: "Tadej Pavković",
    link: "https://radiostudent.si/ljudje/tadej-pavković",
  });

  entries.forEach((entry) => {
    if (!entry.recordingUrl) return;
    feed.addItem({
      title: entry.title,
      id: entry.url,
      link: entry.url,
      description: entry.description,
      author: entry.authors.map((name) => ({ name })),
      date: entry.date,
      enclosure: {
        url: entry.recordingUrl,
      },
    });
  });

  return feed.rss2();
}
