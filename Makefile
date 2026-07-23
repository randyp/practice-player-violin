.PHONY: dev build preview install songs

install:
	pnpm install

songs:
	node scripts/generate-songs.mjs

dev:
	pnpm run dev --port 8282

build:
	pnpm run build

preview:
	pnpm run preview --port 8282
