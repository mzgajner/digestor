# Digestor

A tiny Deno app that parses an existing podcast feed of
[Pritiskavec gold](https://radiostudent.si/kultura/pritiskavec-gold), a radio
show on [Radio Študent](https://radiostudent.si). It improves it and generates a
new feed that's compatible with the requirements of iTunes, Spotify and other
podcast platforms so it can be published there.

## Development

Pretty much the most default Deno setup:

```bash
# Starts dev server on localhost:8080
deno task dev

# Runs (very few) tests
deno test

# Autoformats all files
deno fmt
```

## Deployment

Deployed to [pritiskavec.z0.si](https://pritiskavec.z0.si/) on Dokku via the
included `Dockerfile`. Dokku detects the Dockerfile, maps public port 80 to the
container's exposed 8080, and the app reads `$PORT` from the environment.

First-time setup on the Dokku host:

```bash
dokku apps:create pritiskavec
dokku domains:set pritiskavec pritiskavec.z0.si
# optional: dokku letsencrypt:enable pritiskavec
```

The `feed.rss` and the transcripts are committed and served as static files.
Deploys happen from GitHub: every push to `main` runs the `Deploy` workflow,
which pushes to the Dokku app. Pushing to a `dokku` git remote by hand still
works but is no longer needed.

## Automation

The `Refresh feed` workflow runs daily on GitHub Actions and does what used to
be a manual chore:

1. `deno task regenerate --no-transcripts` looks for new episodes. If the feed
   really changed (a fresh build timestamp alone doesn't count), it is committed
   to `main` and deployed.
2. If the repository variable `TRANSCRIBE_IN_CI` is `true`, the newest episode
   from the last 60 days that has no transcript is transcribed on the runner's
   CPU with faster-whisper, committed together with the re-tagged feed and
   deployed again. This takes a couple of hours and costs nothing: standard
   runners are free and unlimited for public repositories.

The run fails loudly (and commits nothing) when the source site can't be
scraped, for instance because it answers GitHub's runners with an anti-bot
challenge. If the listing works but a newly listed episode can't be fetched,
`regenerate` still writes the feed and exits with code 3; the workflow publishes
what it has and marks the run as failed, so you hear about it.

Since the workflow commits to `main`, **pull before running `regenerate` or
`transcribe` locally** so you build on what it already did. `feed.rss` is
derived state: if a local copy conflicts, `git checkout feed.rss && git pull`.

Configuration, all under the repository's Actions settings:

| Name                    | Kind     | Purpose                                                       |
| ----------------------- | -------- | ------------------------------------------------------------- |
| `DOKKU_SSH_PRIVATE_KEY` | secret   | Deploy key registered on the server with `dokku ssh-keys:add` |
| `DOKKU_KNOWN_HOSTS`     | variable | Output of `ssh-keyscan -t ed25519 z0.si`, pins the host key   |
| `TRANSCRIBE_IN_CI`      | variable | `true` turns on transcription in the daily run                |
| `TRANSCRIBE_MODEL`      | variable | Optional model override, e.g. `large-v3-turbo`                |
| `TRANSCRIBE_BATCH_SIZE` | variable | Optional faster-whisper batch size (default 8)                |
| `HF_TOKEN`              | secret   | Optional, avoids anonymous rate limits on model downloads     |

Setting up the deploy key:

```bash
ssh-keygen -t ed25519 -N '' -C 'github-actions@digestor' -f ./gh_dokku
cat gh_dokku.pub | ssh root@z0.si dokku ssh-keys:add github-actions
gh secret set DOKKU_SSH_PRIVATE_KEY < gh_dokku
gh variable set DOKKU_KNOWN_HOSTS --body "$(ssh-keyscan -t ed25519 z0.si)"
shred -u gh_dokku gh_dokku.pub
# revoke with: dokku ssh-keys:remove github-actions
```

A Dokku SSH key can run any dokku command on the server, not just deploy this
app, so the workflows are built around it: only the deploy job can read the key,
the job that runs the transcription code for hours has a read-only token and no
secrets, and a separate small job commits nothing but the transcript JSON it
produced. Pull requests only ever run the `Test` workflow, which gets no secrets
(never add `pull_request_target`). The
[dokku-acl](https://github.com/dokku-community/dokku-acl) plugin can restrict
the key to this app.

The `Test` workflow (format, type check, both test suites) runs on pull requests
and must pass before a push to `main` is deployed.

The workflow can also be started by hand from the Actions tab: `dry_run` commits
and deploys nothing, and `guid` transcribes one given episode into a build
artifact as a timing test. GitHub disables scheduled workflows in repositories
without activity for 60 days; it emails before doing so, and the workflow can be
re-enabled from the Actions tab.

## Transcripts

Every episode can carry a transcript, published through the Podcasting 2.0
`<podcast:transcript>` tag in VTT, SRT and JSON form (Pocket Casts, Overcast,
Podcast Addict, Fountain and friends pick these up; Apple Podcasts currently
only ingests creator transcripts in a handful of languages, Slovenian not among
them).

Transcripts are generated locally with Whisper `large-v3`. Two engines are wired
in behind the same `Transcriber` interface:

- **whisper.cpp on the GPU (default)**: built with the Vulkan backend, so it
  runs on the Radeon iGPU and leaves the CPU free. A 5-bit quantised large-v3
  transcribes at roughly 0.2x real time (an hour of audio in about 12 minutes)
  with the same accuracy as the full-precision model.
- **faster-whisper on the CPU** (`--engine faster-whisper`): a small Python
  sidecar in `transcription/sidecar/` managed by
  [uv](https://docs.astral.sh/uv/). Roughly 0.45x real time with
  `--batch-size 8`, or 0.23x with `--model large-v3-turbo` at slightly different
  accuracy.

Both need `ffmpeg`, which decodes the archive's MP3s (some have corrupt frames
that other decoders stop at).

### Setup for whisper.cpp

```bash
# Fedora; other distros need the equivalent of cmake, glslc and Vulkan headers
sudo dnf install cmake ninja-build glslc vulkan-headers vulkan-loader-devel
transcription/whispercpp/setup.sh
```

The script clones a pinned whisper.cpp into `.cache/whisper.cpp`, builds
`whisper-cli` with Vulkan and downloads the `large-v3-q5_0` and Silero VAD
models. Without root, unpack the
[LunarG Vulkan SDK](https://vulkan.lunarg.com/sdk/home) somewhere, put `cmake`
on `PATH` and run the script with `VULKAN_SDK` pointing at its `x86_64`
directory. faster-whisper needs no setup beyond `uv`; its model (~3 GB)
downloads to `~/.cache/huggingface` on first use.

### Running

```bash
# Transcribe every episode without a transcript, oldest first. Resumable:
# stop it whenever, rerun and it picks up where it left off.
deno task transcribe

# Useful flags
deno task transcribe --limit 5                       # only the next five episodes
deno task transcribe --guid 26613                    # a single episode
deno task transcribe --force --guid 26613            # redo an episode
deno task transcribe --engine faster-whisper --batch-size 8   # CPU fallback
deno task transcribe --model large-v3                 # a different model (ggml name for whisper.cpp)
deno task transcribe --out-dir .cache/pilot          # write somewhere else (for comparisons)
```

The backfill takes a while (the whole archive is about a day on the GPU), so run
it in `tmux` or with `nohup`. Progress goes to the console and to
`.cache/transcribe.log`, which records model, wall time and realtime factor
(wall time divided by audio length, lower is better) per episode. An episode
whose decoded audio is shorter than the feed says is refused rather than stored
truncated.

Results land in `transcripts/<guid>.json`, one file per episode, which are
committed and served by the app at `/podcast/transcripts/<guid>.vtt`, `.srt` and
`.json` (rendered on request from the JSON). The raw engine output including
word timings is kept in `.cache/raw/` so the cue splitting in
`transcription/formats.ts` can be re-tuned without transcribing again.

`deno task regenerate` transcribes any episode that doesn't have a transcript
yet before writing the feed, so after the initial backfill it only handles the
newest episode. Pass `--no-transcripts` for a quick feed-only refresh. The
workflow is therefore: run `regenerate` (or `transcribe`), commit `feed.rss` and
`transcripts/`, push.

The pipeline is split into small services under `transcription/` (download,
transcribers, store, formats, pipeline). Speaker identification isn't enabled,
but the data model reserves a `speaker` field per segment and a diarizing
`Transcriber` can be added later.
