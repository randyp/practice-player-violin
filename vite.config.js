import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  base: '/practice-player-violin/',
  plugins: [svelte()],
  build: {
    outDir: 'docs',
  },
})
