import { type ParsedEntry } from './parse.ts'

// Reads the entries already present in an existing feed.rss back into
// ParsedEntry form, keyed by episode URL. This lets us regenerate the feed
// without re-fetching episodes we already have (and without ever losing them
// to a flaky source). Returns an empty map if the file doesn't exist yet.
export async function readExistingEntries(
  path: string,
): Promise<Map<string, ParsedEntry>> {
  let xml: string
  try {
    xml = await Deno.readTextFile(path)
  } catch {
    return new Map()
  }

  const entries = new Map<string, ParsedEntry>()
  for (const match of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
    const entry = parseItem(match[1])
    if (entry) entries.set(entry.url, entry)
  }
  return entries
}

function parseItem(item: string): ParsedEntry | null {
  const url = text(item, 'link')
  if (!url) return null

  return {
    imageUrl: unescapeXml(attr(item, 'itunes:image', 'href') ?? ''),
    authors: splitAuthors(cdata(item, 'dc:creator') ?? ''),
    description: cdata(item, 'description') ?? undefined,
    subtitle: unescapeXml(text(item, 'itunes:subtitle') ?? '') || undefined,
    date: new Date(text(item, 'pubDate') ?? ''),
    enclosure: {
      url: unescapeXml(attr(item, 'enclosure', 'url') ?? ''),
      size: Number(attr(item, 'enclosure', 'length') ?? '0'),
    },
    duration: parseDuration(text(item, 'itunes:duration') ?? '0'),
    url,
    guid: text(item, 'guid') ?? '',
    title: cdata(item, 'title') ?? '',
  }
}

function cdata(item: string, tag: string) {
  const match = item.match(
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, 's'),
  )
  return match?.[1]
}

function text(item: string, tag: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 's'))
  return match?.[1]
}

function attr(item: string, tag: string, name: string) {
  const match = item.match(new RegExp(`<${tag}[^>]*\\s${name}="(.*?)"`, 's'))
  return match?.[1]
}

// Reverses generateHumanReadableAuthors: "A, B in C" -> ["A", "B", "C"].
function splitAuthors(joined: string) {
  if (!joined) return []
  return joined.replace(/ in (?=[^,]*$)/, ', ').split(', ')
}

function parseDuration(hms: string) {
  return hms.split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

function unescapeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}
