import { Feed } from "npm:feed";
import { type ParsedEntry } from "./parsing.ts";

const RS_LOGO_URL = "https://small-dragonfly-27.deno.dev/logo.png"

export function generateFeed(entries: ParsedEntry[]) {
  const feed = new Feed({
    title: "Pritiskavec Gold",
    description: "Radijska oddaja o računalniških igrah in z njimi povezanimi družbenimi fenomeni",
    id: "https://radiostudent.si/kultura/pritiskavec-gold",
    link: "https://radiostudent.si/kultura/pritiskavec-gold",
    language: "sl",
    image: RS_LOGO_URL,
    favicon: "https://radiostudent.si/sites/all/themes/eresh_lime/favicon.ico",
    copyright: "Radio Študent, 2023",
    updated: new Date(2013, 6, 14),
    generator: "mzgajner/digestor",
    author: entries[0].authors
  });

  entries.forEach(entry => {
    feed.addItem({
      title: entry.title,
      id: entry.url,
      link: entry.url,
      description: entry.description,
      content: entry.content,
      author: entry.authors,
      date: entry.date,
      image: RS_LOGO_URL
    });
  });

  return feed.rss2()
}
