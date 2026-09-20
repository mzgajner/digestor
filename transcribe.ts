import { parseArgs } from 'https://deno.land/std/cli/parse_args.ts'
import { readExistingEntries } from './existing.ts'
import {
  createDefaultDeps,
  recueEpisode,
  resolveBatchSize,
  resolveEngine,
  resolveModel,
  selectPending,
  transcribeMissing,
  withinDays,
} from './transcription/mod.ts'

// One-off backfill (and pilot) runner. Works off the committed feed.rss so it
// never hits the source site; new episodes get transcribed by `regenerate`.
//
//   deno task transcribe                       # every episode without a transcript, oldest first
//   deno task transcribe --limit 5             # just the next five
//   deno task transcribe --guid 26613          # one episode
//   deno task transcribe --model large-v3-turbo --out-dir .cache/pilot/turbo
//   deno task transcribe --force --guid 26613  # redo an episode
//   deno task transcribe --engine faster-whisper --batch-size 8   # CPU fallback
//   deno task transcribe --recue [--guid 26613]  # rebuild cues from cached raw output
//
// What the unattended workflow runs (only fresh episodes, newest first):
//   deno task transcribe --newest-first --limit 1 --max-age-days 60 [--dry-run]

const FEED_PATH = 'feed.rss'

const args = parseArgs(Deno.args, {
  string: [
    'limit',
    'guid',
    'engine',
    'model',
    'out-dir',
    'batch-size',
    'max-age-days',
  ],
  boolean: ['force', 'newest-first', 'recue', 'dry-run'],
})

const existing = await readExistingEntries(FEED_PATH)
let entries = [...existing.values()]
if (entries.length === 0) {
  console.error(`No episodes found in ${FEED_PATH}.`)
  Deno.exit(1)
}

if (args.guid) {
  entries = entries.filter((entry) => entry.guid === args.guid)
  if (entries.length === 0) {
    console.error(`No episode with guid "${args.guid}" in ${FEED_PATH}.`)
    Deno.exit(1)
  }
}

if (args['max-age-days']) {
  entries = withinDays(entries, Number(args['max-age-days']))
}

const engine = resolveEngine(Deno.args)
const deps = createDefaultDeps({
  engine,
  model: resolveModel(Deno.args, engine),
  outDir: args['out-dir'],
  batchSize: resolveBatchSize(Deno.args),
})

if (args.recue) {
  const guids = args.guid ? [args.guid] : [...await deps.store.list()]
  for (const guid of guids) await recueEpisode(guid, deps)
  Deno.exit(0)
}

const selection = {
  limit: args.limit ? Number(args.limit) : undefined,
  force: args.force,
  oldestFirst: !args['newest-first'],
}

// Lists what a real run would transcribe, one tab-separated line per episode
// on stdout, and nothing else.
if (args['dry-run']) {
  for (const entry of await selectPending(entries, deps.store, selection)) {
    console.log(`${entry.guid}\t${entry.duration}\t${entry.title}`)
  }
  Deno.exit(0)
}

const results = await transcribeMissing(entries, deps, selection)

Deno.exit(results.some((result) => result.status === 'failed') ? 1 : 0)
