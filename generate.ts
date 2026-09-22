import { Podcast } from 'npm:podcast'
import { type ParsedEntry } from './parse.ts'
import { LANGUAGE, PUBLIC_BASE_URL } from './transcription/config.ts'
import { FORMATS, transcriptUrl } from './transcription/formats.ts'
import { generateHumanReadableAuthors } from './utils.ts'

const LAST_BUILD_DATE = /<lastBuildDate>[^<]*<\/lastBuildDate>/

// The podcast library stamps <lastBuildDate> with the current time on every
// build, so two feeds count as the same when that is the only difference.
export function isSameFeed(a: string, b: string) {
  return a.replace(LAST_BUILD_DATE, '') === b.replace(LAST_BUILD_DATE, '')
}

export type GenerateOptions = {
  // Guids of episodes that have a transcript; they get podcast:transcript tags.
  transcriptGuids?: Set<string>
  baseUrl?: string
}

export function generateFeed(
  entries: ParsedEntry[],
  { transcriptGuids = new Set(), baseUrl = PUBLIC_BASE_URL }: GenerateOptions =
    {},
) {
  const feed = new Podcast({
    title: 'Pritiskavec Gold',
    description:
      'Radijska oddaja o računalniških igrah in z njimi povezanimi družbenimi fenomeni.',
    siteUrl: 'https://radiostudent.si/kultura/pritiskavec-gold',
    language: 'sl',
    imageUrl: 'https://pritiskavec.z0.si/logo.jpg',
    copyright: 'Radio Študent, 2024',
    pubDate: entries[0].date,
    generator: 'mzgajner/digestor',
    author: 'Domen Mohorič, Rasto Pahor, Tadej Pavkovič in Mato Žgajner',
    itunesOwner: {
      name: 'Domen Mohorič, Rasto Pahor, Tadej Pavkovič in Mato Žgajner',
      email: 'mato@zgajner.com',
    },
    itunesExplicit: false,
    categories: ['Video Games'],
    itunesCategory: [
      {
        text: 'Leisure',
        subcats: [{ text: 'Video Games' }],
      },
    ],
    namespaces: {
      iTunes: true,
      podcast: true,
      simpleChapters: false,
    },
    customElements: [
      {
        'atom:link': {
          _attr: {
            rel: 'self',
            href: 'https://pritiskavec.z0.si/podcast/feed.xml',
          },
        },
      },
      { 'itunes:new-feed-url': 'https://pritiskavec.z0.si/podcast/feed.xml' },
      { 'podcast:locked': 'no' },
      {
        'podcast:funding': [
          {
            _attr: {
              url: 'https://siri.radiostudent.si/',
            },
          },
          'Podpri Radio Študent',
        ],
      },
    ],
  })

  entries.forEach((entry) => {
    feed.addItem({
      imageUrl: entry.imageUrl,
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
      customElements: [
        { 'dc:description': entry.description },
        ...(transcriptGuids.has(entry.guid)
          ? transcriptElements(entry.guid, baseUrl)
          : []),
      ],
    })
  })

  return feed.buildXml({ indent: '  ' })
}

// One <podcast:transcript/> per format, VTT first (see FORMATS).
function transcriptElements(guid: string, baseUrl: string) {
  return FORMATS.map(({ extension, mimeType }) => ({
    'podcast:transcript': {
      _attr: {
        url: transcriptUrl(guid, extension, baseUrl),
        type: mimeType,
        language: LANGUAGE,
      },
    },
  }))
}
