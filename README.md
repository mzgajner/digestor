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
dokku apps:create digestor
dokku domains:set digestor pritiskavec.z0.si
# optional: dokku letsencrypt:enable digestor
```

Then, from a local clone, add the remote and push:

```bash
git remote add dokku dokku@<your-dokku-host>:digestor
git push dokku main
```

The `feed.rss` is committed and served as a static file. To refresh it with new
episodes, run `deno task regenerate` locally and commit the result before
pushing.
