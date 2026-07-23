.PHONY: dev build preview install

install:
	pnpm install

dev:
	pnpm run dev --port 8282

build:
	pnpm run build

preview:
	pnpm run preview --port 8282
