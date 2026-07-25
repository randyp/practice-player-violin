# Violin Practice Player

A practice player for violin students: sheet music rendered with
VexFlow, synth playback and a metronome via Tone.js, count-in, per-song
keys and tempo, and a highlight that follows the score as it plays.
Built with Vite + Svelte 5.

## Vision

A lightweight, mostly free, client-side practice tool:

- **No server of our own.** Everything — notation, playback,
  preferences — runs in the browser, hosted as static files (GitHub
  Pages today). This is a hard constraint on every feature, not an
  implementation detail (see `design/TODO.md`).
- **Users bring their own backend.** Signing in with Google lets each
  user's personal song library live in their own Google Drive, using
  the narrow `drive.file` scope so the app can only see files it
  created itself. The project never operates or pays for storage.
- **A free marketplace of curated music.** A public, static catalog of
  songs that anyone can browse without an account and add to their
  library with one click — designed in `design/marketplace.md`.

Design notes, the song format, and the roadmap live in `design/`.

## Development

```sh
make install   # pnpm install
make dev       # serves on http://localhost:8282
```

Songs are static JSON under `public/songs/` (a `catalog.json` index
plus one file per song), fetched lazily by the app rather than bundled
into the JS. They're generated, not hand-written:

```sh
make songs     # regenerates public/songs/ from scripts/generate-songs.mjs
```

Edit the song definitions in `scripts/generate-songs.mjs`, run
`make songs`, then commit the regenerated `public/songs/` output.

## Build

```sh
make build     # builds into docs/
```

The site is published via GitHub Pages, configured to serve from the
`docs/` directory on `main`. Rebuild and commit `docs/` before pushing
changes you want live.
