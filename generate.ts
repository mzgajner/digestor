import { Podcast } from "npm:podcast";
import { type ParsedEntry } from "./parse.ts";
import { generateHumanReadableAuthors } from "./utils.ts";

export function generateFeed(entries: ParsedEntry[]) {
  const feed = new Podcast({
    title: "Pritiskavec Gold",
    description:
      "Radijska oddaja o računalniških igrah in z njimi povezanimi družbenimi fenomeni.",
    siteUrl: "https://radiostudent.si/kultura/pritiskavec-gold",
    language: "sl",
    imageUrl:
      "https://radiostudent.si/sites/all/themes/radiostudent/images/podcast_logo.png",
    copyright: "Radio Študent, 2023",
    pubDate: entries[0].date,
    generator: "mzgajner/digestor",
    author: "Domen Mohorič, Mato Žgajner, Rasto Pahor in Tadej Pavkovič",
    itunesOwner: {
      name: "Domen Mohorič, Mato Žgajner, Rasto Pahor in Tadej Pavkovič",
      email: "mato@zgajner.com",
    },
    itunesExplicit: false,
    categories: ["Video Games"],
    itunesCategory: [
      {
        text: "Leisure",
        subcats: [{ text: "Video Games" }],
      },
    ],
    namespaces: {
      iTunes: true,
      podcast: true,
      simpleChapters: false,
    },
    customElements: [
      {
        "atom:link": {
          _attr: {
            rel: "self",
            href: "https://small-dragonfly-27.deno.dev/podcast/feed.xml",
          },
        },
      },
      { "podcast:locked": "no" },
      {
        "podcast:funding": [
          {
            _attr: {
              url: "https://siri.radiostudent.si/",
            },
          },
          "Podpri Radio Študent",
        ],
      },
    ],
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
      itunesDuration: entry.duration,
      customElements: [{ "dc:description": entry.description }],
    });
  });

  return feed.buildXml({ indent: "  " });
}
