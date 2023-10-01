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

Automatically deployed to
[small-dragonfly-27.deno.dev](https://small-dragonfly-27.deno.dev/) with Deno
Deploy.
