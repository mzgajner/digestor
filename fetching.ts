import { getEntriesFromFeed } from "./parsing.ts";
import { testNewsXml, testPodcastXml } from "./test-xml.ts";

const NEWS_FEED_URL = "https://radiostudent.si/taxonomy/term/55167/%2A/feed";
const PODCAST_FEED_URL =
  "https://radiostudent.si/kultura/pritiskavec-gold/podcast";

export async function fetchFeed() {
  // const newsEntries = []
  // let entriesInLastRequest = 0
  // let currentPage = 0

  // do {
  //   const entries = await fetchEntries(`${NEWS_FEED_URL}?page=${currentPage}`)
  //   newsEntries.push(...entries)
  //   entriesInLastRequest = entries.length
  //   currentPage++
  // } while (entriesInLastRequest > 0)

  // const podcastEntries = await fetchEntries(PODCAST_FEED_URL)

  const newsEntries = await getEntriesFromFeed(testNewsXml);
  const podcastEntries = await getEntriesFromFeed(testPodcastXml);

  return { newsEntries, podcastEntries };
}

async function fetchEntries(url: string) {
  const response = await fetch(url);
  const xml = await response.text();
  const entries = await getEntriesFromFeed(xml);

  return entries;
}
