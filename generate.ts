import { Podcast } from "npm:podcast";
import { type ParsedEntry } from "./parse.ts";
import { generateHumanReadableAuthors } from "./utils.ts";

const RS_LOGO_URL = "https://small-dragonfly-27.deno.dev/logo.png";

export function generateFeed(entries: ParsedEntry[]) {
  const feed = new Podcast({
    title: "Pritiskavec Gold",
    description:
      "Radijska oddaja o računalniških igrah in z njimi povezanimi družbenimi fenomeni",
    siteUrl: "https://radiostudent.si/kultura/pritiskavec-gold",
    language: "sl",
    imageUrl: RS_LOGO_URL,
    copyright: "Radio Študent, 2023",
    pubDate: entries[0].date,
    generator: "mzgajner/digestor",
    author: "Domen Mohorič, Mato Žgajner, Rasto Pahor in Tadej Pavkovič",
    itunesExplicit: false,
    categories: ["Video Games"],
    itunesCategory: [{
      text: "Leisure",
      subcats: [{ text: "Video Games" }],
    }],
  });

  entries.forEach((entry) => {
    feed.addItem({
      title: entry.title,
      guid: entry.guid,
      url: entry.url,
      description: entry.description,
      author: generateHumanReadableAuthors(entry.authors),
      date: entry.date,
      enclosure: entry.enclosure,
      itunesSummary: entry.subtitle,
      itunesSubtitle: entry.subtitle,
    });
  });

  return feed.buildXml({ indent: "  " });
}
