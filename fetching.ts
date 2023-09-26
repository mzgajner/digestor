import { getEntriesFromFeed, parseEntries } from "./parsing.ts";
import { testXml } from "./test-xml.ts";

const NEWS_FEED_URL =
  "https://radiostudent.si/taxonomy/term/55167/%2A/feed"; // ?page=0
const PODCAST_FEED_URL =
  "https://radiostudent.si/kultura/pritiskavec-gold/podcast";

export async function fetchFeed() {
  // const allEntries = []
  // let entriesInLastRequest = 0
  // let currentPage = 0

  // do {
  //   const url = `${NEWS_FEED_URL}?page=${currentPage}`
  //   const response = await fetch(url);
  //   const xml = await response.text();
  //   const entries = await getEntriesFromFeed(xml)

  //   allEntries.push(...entries)
  //   entriesInLastRequest = entries.length
  //   currentPage++
  // } while (entriesInLastRequest > 0)

  const allEntries = await getEntriesFromFeed(testXml)
  return allEntries
}
