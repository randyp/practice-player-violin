.PHONY: dev build preview install songs test

install:
	pnpm install

songs:
	node scripts/generate-songs.mjs

test:
	pnpm run test

dev:
	pnpm run dev --port 8282

build:
	pnpm run build

preview:
	pnpm run preview --port 8282
