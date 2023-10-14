import { Html5Entities } from 'https://deno.land/x/html_entities/mod.js'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import { getLastName } from './utils.ts'

import type { FeedEntry } from 'https://deno.land/x/rss/src/types/feed.ts'
import type { PodcastFeedEntry } from './fetch.ts'

export function parseEntries(
  newsEntries: FeedEntry[],
  podcastEntries: PodcastFeedEntry[],
) {
  const entries = podcastEntries
    .map((podcastEntry) => ({
      podcastEntry,
      newsEntry: newsEntries.find(
        (entry) => entry.links[0].href === podcastEntry.id,
      )!,
    }))
    .filter((entry) => entry.newsEntry)
    .map(transformEntry)
    .sort((a, b) => b.date?.getTime() - a.date?.getTime())

  return entries
}

function bytesToSeconds(bytes: number) {
  const BITRATE_IN_KILOBITS_PER_SECOND = 320

  const kilobytes = bytes / 1000
  const kilobits = kilobytes * 8
  const seconds = kilobits / BITRATE_IN_KILOBITS_PER_SECOND

  return seconds
}

function transformEntry({
  podcastEntry,
  newsEntry,
}: {
  podcastEntry: PodcastFeedEntry
  newsEntry: FeedEntry
}) {
  const { imageUrl, authors, description } = parseValuesFromPostHtml(
    newsEntry.description?.value ?? '',
  )

  return {
    imageUrl,
    authors,
    description,
    subtitle: podcastEntry['itunes:summary'].value,
    date: podcastEntry.published!,
    enclosure: {
      url: podcastEntry.attachments![0].url!,
      size: podcastEntry.attachments![0].sizeInBytes!,
      type: podcastEntry.attachments![0].mimeType!,
    },
    duration: bytesToSeconds(podcastEntry.attachments![0].sizeInBytes!),
    guid: newsEntry.id.split(' at ')[0],
    url: newsEntry.links[0]!.href ?? '',
    title: newsEntry.title?.value ?? '',
  }
}

export type ParsedEntry = ReturnType<typeof transformEntry>

export function parseValuesFromPostHtml(postHtml: string) {
  const decodedHtml = Html5Entities.decode(postHtml)
  const document = new DOMParser().parseFromString(decodedHtml, 'text/html')

  // Image URL
  const imageUrl = document
    ?.querySelector('.field-name-field-image a')
    ?.getAttribute('href') ?? ''

  // List of all author names
  const mainAuthorElement = document?.querySelector('.field-name-author a')
  const additionalAuthorElements = document?.querySelectorAll(
    '.field-name-field-dodatni-avtorji .field-item',
  )!
  const allAuthorElements = [mainAuthorElement, ...additionalAuthorElements]
  const authors = allAuthorElements
    .map((element) => element?.textContent ?? '')
    .filter(Boolean)
    .sort((a, b) => getLastName(a).localeCompare(getLastName(b)))

  // Description text from the actual post body
  const description = document?.querySelector(
    '.field-name-body .field-item',
  )?.innerHTML

  return { imageUrl, authors, description }
}
