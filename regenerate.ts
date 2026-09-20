/// <reference lib="deno.unstable" />

import fetchEpisodeUrls from './fetch.ts'
import { generateFeed, isSameFeed } from './generate.ts'
import { parseEntries } from './parse.ts'
import { readExistingEntries } from './existing.ts'
import {
  createDefaultDeps,
  createFileStore,
  resolveBatchSize,
  resolveEngine,
  resolveModel,
  transcribeMissing,
} from './transcription/mod.ts'

const FEED_PATH = 'feed.rss'

// Pass --full to re-fetch every episode from scratch. By default we only fetch
// episodes that aren't already in feed.rss and reuse the rest as-is.
const full = Deno.args.includes('--full')

// Pass --no-transcripts to skip transcribing episodes that don't have a
// transcript yet (a fresh episode takes a good while on CPU).
const transcribe = !Deno.args.includes('--no-transcripts')

const episodeUrls = await fetchEpisodeUrls()
const existing = await readExistingEntries(FEED_PATH)

const newCount = episodeUrls.filter((url) => !existing.has(url)).length
console.log(
  full
    ? `Re-fetching all ${episodeUrls.length} episodes.`
    : `${existing.size} existing episodes, fetching ${newCount} new.`,
)

const entries = await parseEntries(episodeUrls, { existing, full })

if (transcribe) {
  const engine = resolveEngine(Deno.args)
  const deps = createDefaultDeps({
    engine,
    model: resolveModel(Deno.args, engine),
    batchSize: resolveBatchSize(Deno.args),
  })
  await transcribeMissing(entries, deps)
}

const transcriptGuids = await createFileStore().list()
const feed = generateFeed(entries, { transcriptGuids })

// Only touch the file when something other than the build timestamp changed,
// so an unattended run commits (and deploys) only real changes.
const previous = await Deno.readTextFile(FEED_PATH).catch(() => '')
if (isSameFeed(previous, feed)) {
  console.log(`No changes to ${FEED_PATH}.`)
} else {
  await Deno.writeTextFile(FEED_PATH, feed)
  console.log(`Wrote ${entries.length} episodes to ${FEED_PATH}.`)
}
