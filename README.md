# Violin Practice Player

A scale/tune practice player: renders notation with VexFlow, plays a
sampled violin tone via Tone.js, and follows along with a bow-direction
and beat indicator. Built with Vite + Svelte 5.

## Development

```sh
make install   # pnpm install
make dev       # serves on http://localhost:8282
```

## Build

```sh
make build     # builds into docs/
```

The site is published via GitHub Pages, configured to serve from the
`docs/` directory on `main`. Rebuild and commit `docs/` before pushing
changes you want live.
