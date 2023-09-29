import { Html5Entities } from "https://deno.land/x/html_entities/mod.js";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";
import { parseFeed } from "https://deno.land/x/rss/mod.ts";
import { type FeedEntry } from "https://deno.land/x/rss/src/types/feed.ts";
import { datetime } from "https://deno.land/x/ptera/mod.ts";

export function parseEntries(rawEntries: FeedEntry[]) {
  return rawEntries.map(parseEntry);
}

export async function getEntriesFromFeed(xml: string) {
  const feed = await parseFeed(xml);
  return feed.entries;
}

function parseEntry(entry: FeedEntry) {
  const { imageUrl, authors, date, recordingUrl, description } =
    parseValuesFromPost(entry.description?.value ?? "");
  return {
    imageUrl,
    authors,
    date,
    recordingUrl,
    description,
    url: entry.links[0]!.href ?? "",
    title: entry.title?.value ?? "",
  };
}

export type ParsedEntry = ReturnType<typeof parseEntry>;

export function parseValuesFromPost(postHtml: string) {
  const decodedHtml = Html5Entities.decode(postHtml);
  const document = new DOMParser().parseFromString(decodedHtml, "text/html");

  // Image URL
  const imageUrl =
    document
      ?.querySelector(".field-name-field-image a")
      ?.getAttribute("href") ?? "";

  // List of all author names
  const mainAuthorElement = document?.querySelector(".field-name-author a");
  const additionalAuthorElements = document?.querySelectorAll(
    ".field-name-field-dodatni-avtorji .field-item"
  )!;
  const allAuthorElements = [mainAuthorElement, ...additionalAuthorElements];
  const authors = allAuthorElements
    .map((element) => element?.textContent ?? "")
    .filter(Boolean)
    .sort();

  // Date of airing
  const dateFromDescription =
    document?.querySelector(".field-name-field-v-etru")?.textContent ?? "";
  const date = datetime()
    .parse(dateFromDescription, "d. M. YYYY - H.mm", {
      locale: "Europe/Ljubljana",
    })
    .toJSDate();

  // Path to recording, if it exists
  const recordingUrl = document
    ?.querySelector(".jp-playlist-first a")
    ?.getAttribute("href");

  // Description text from the actual post body
  const description = document?.querySelector(
    ".field-name-body .field-item"
  )?.innerHTML;

  return { imageUrl, authors, date, recordingUrl, description };
}
