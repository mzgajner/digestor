import { load } from "https://deno.land/std/dotenv/mod.ts";
import { ExtendedFeedEntry, getEntriesFromFeed } from "./parse.ts";
import { testNewsXml, testPodcastXml } from "./test-xml.ts";

const NEWS_FEED_URL = "https://radiostudent.si/taxonomy/term/55167/%2A/feed";
const PODCAST_FEED_URL =
  "https://radiostudent.si/kultura/pritiskavec-gold/podcast";

const env = await load();

export async function fetchFeed() {
  let newsEntries, podcastEntries;
  if (env["ENVIRONMENT"] === "development") {
    newsEntries = await getEntriesFromFeed(testNewsXml);
    podcastEntries = await getEntriesFromFeed(testPodcastXml);
  } else {
    newsEntries = [];
    let entriesInLastRequest = 0;
    let currentPage = 0;

    do {
      const entries = await fetchEntries(
        `${NEWS_FEED_URL}?page=${currentPage}`,
      );
      newsEntries.push(...entries);
      entriesInLastRequest = entries.length;
      currentPage++;
    } while (entriesInLastRequest > 0);

    podcastEntries = await fetchEntries(PODCAST_FEED_URL);
  }

  return { newsEntries, podcastEntries: podcastEntries as ExtendedFeedEntry[] };
}

async function fetchEntries(url: string) {
  const response = await fetch(url);
  const xml = await response.text();
  const entries = await getEntriesFromFeed(xml);

  return entries;
}
