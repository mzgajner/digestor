import { Html5Entities } from 'https://deno.land/x/html_entities/mod.js'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import { convertBytesToSeconds, getLastName } from './utils.ts'

import type { PodcastFeedEntry } from './fetch.ts'

export async function parseEntries(podcastEntries: PodcastFeedEntry[]) {
  const transformedEntries = podcastEntries.map(transformEntry)
  const entries = (await Promise.all(transformedEntries))
    .sort((a, b) => b.date?.getTime() - a.date?.getTime())

  return entries
}

async function transformEntry(podcastEntry: PodcastFeedEntry) {
  const postHtml = await fetchHtml(podcastEntry.id)
  const { imageUrl, authors, description, guid } = parseValuesFromPostHtml(
    postHtml,
  )

  const mp3Url = podcastEntry.attachments![0].url!
  const contentLength = await fetchContentLength(mp3Url)

  return {
    imageUrl,
    authors,
    description,
    subtitle: podcastEntry['itunes:summary'].value,
    date: podcastEntry.published!,
    enclosure: {
      url: mp3Url,
      size: contentLength,
    },
    duration: convertBytesToSeconds(contentLength),
    url: podcastEntry.id,
    guid,
    title: podcastEntry.title!.value,
  }
}

export type ParsedEntry = Awaited<ReturnType<typeof transformEntry>>

async function fetchHtml(url: string) {
  const response = await fetch(url)
  const html = await response.text()
  return html
}

async function fetchContentLength(mp3Url: string) {
  const response = await fetch(mp3Url, { method: 'HEAD' })
  const contentLength = response.headers.get('content-length')!
  return Number(contentLength)
}

export function parseValuesFromPostHtml(postHtml: string) {
  const decodedHtml = Html5Entities.decode(postHtml)
  const document = new DOMParser().parseFromString(decodedHtml, 'text/html')
  const node = document!.querySelector('.node')!

  // Image URL
  const imageUrl = node
    ?.querySelector('.field--name-field-slika-media a')
    ?.getAttribute('href') ?? ''
    .replace('default/files', 'default/files/styles/thumbnail_grid')

  // List of all author names
  const mainAuthorElement = node?.querySelector('.field--name-uid a')
  const additionalAuthorElements = node?.querySelectorAll(
    '.field--name-field-dodatni-avtorji .field__item a',
  )!
  const allAuthorElements = [mainAuthorElement, ...additionalAuthorElements]
  const authors = allAuthorElements
    .map((element) => element?.textContent ?? '')
    .filter(Boolean)
    .sort((a, b) => getLastName(a).localeCompare(getLastName(b)))

  // Description text from the actual post body
  const description = node?.querySelector(
    '.field--name-body.field__item',
  )?.innerHTML

  // Node ID to use as guid
  const commentFormElement = node.querySelector(
    '.node .comment-comment-node-prispevek-form',
  )!
  const guid = commentFormElement.getAttribute('action')!.match(/\d+/)![0]

  return { imageUrl, authors, description, guid }
}
