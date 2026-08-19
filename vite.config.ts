import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/RplusS/ , so assets need that base path.
export default defineConfig({
  base: '/RplusS/',
  plugins: [react()],
  build: {
    target: 'es2022',
    // Chunk splitting is deliberately left to Rolldown's defaults for now;
    // revisit in the Phase 8 perf pass with real bundle numbers.
  },
})
