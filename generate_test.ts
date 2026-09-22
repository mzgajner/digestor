import { assertEquals } from 'https://deno.land/std/assert/mod.ts'
import { generateFeed, isSameFeed } from './generate.ts'
import type { ParsedEntry } from './parse.ts'

function entry(guid: string): ParsedEntry {
  return {
    imageUrl: 'https://example.com/img.png',
    authors: ['Mato Žgajner', 'Rasto Pahor'],
    description: '<p>Opis</p>',
    subtitle: 'Podnaslov',
    date: new Date('2026-09-08T18:00:00Z'),
    enclosure: { url: `https://example.com/${guid}.mp3`, size: 100 },
    duration: 3600,
    url: `https://example.com/${guid}`,
    guid,
    title: `Ep ${guid}`,
  }
}

function itemXml(feed: string, guid: string) {
  const match = feed.match(
    new RegExp(
      `<item>(?:(?!<item>).)*?<guid[^>]*>${guid}</guid>.*?</item>`,
      's',
    ),
  )
  return match?.[0] ?? ''
}

Deno.test(function generateFeedEmitsTranscriptTagsInFormatOrderTest() {
  const feed = generateFeed([entry('1'), entry('2')], {
    transcriptGuids: new Set(['1']),
  })

  const withTranscript = itemXml(feed, '1')
  const tags = [...withTranscript.matchAll(/<podcast:transcript [^>]*\/>/g)]
    .map(
      (m) => m[0],
    )
  assertEquals(tags, [
    '<podcast:transcript url="https://pritiskavec.z0.si/podcast/transcripts/1.vtt" type="text/vtt" language="sl"/>',
    '<podcast:transcript url="https://pritiskavec.z0.si/podcast/transcripts/1.srt" type="application/x-subrip" language="sl"/>',
    '<podcast:transcript url="https://pritiskavec.z0.si/podcast/transcripts/1.json" type="application/json" language="sl"/>',
  ])
  assertEquals(itemXml(feed, '2').includes('podcast:transcript'), false)
})

Deno.test(function generateFeedWithoutTranscriptsIsUnchangedTest() {
  const feed = generateFeed([entry('1')])
  assertEquals(feed.includes('podcast:transcript'), false)
  assertEquals(feed.includes('<dc:description>'), true)
})

Deno.test(function generateFeedHonoursBaseUrlTest() {
  const feed = generateFeed([entry('1')], {
    transcriptGuids: new Set(['1']),
    baseUrl: 'http://localhost:8080',
  })
  assertEquals(
    feed.includes('url="http://localhost:8080/podcast/transcripts/1.vtt"'),
    true,
  )
})

Deno.test(function isSameFeedIgnoresLastBuildDateTest() {
  const feed = generateFeed([entry('1')])
  const later = feed.replace(
    /<lastBuildDate>[^<]*<\/lastBuildDate>/,
    '<lastBuildDate>Mon, 01 Jan 2035 00:00:00 GMT</lastBuildDate>',
  )
  assertEquals(later === feed, false)
  assertEquals(isSameFeed(feed, later), true)
})

Deno.test(function isSameFeedDetectsRealChangesTest() {
  const feed = generateFeed([entry('1')])
  const withTranscript = generateFeed([entry('1')], {
    transcriptGuids: new Set(['1']),
  })
  const withNewItem = generateFeed([entry('2'), entry('1')])
  assertEquals(isSameFeed(feed, withTranscript), false)
  assertEquals(isSameFeed(feed, withNewItem), false)
  assertEquals(isSameFeed('', feed), false)
})
