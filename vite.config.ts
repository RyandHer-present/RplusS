import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'

// Stamped into the bundle so the running app can say which build it is. Every
// "have you reloaded?" so far has been guesswork; this answers it.
const buildId = (() => {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim()
    return `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ')
  }
})()
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/RplusS/ , so assets need that base path.
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  base: '/RplusS/',
  plugins: [react()],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Split the big, rarely-changing libraries out of the app bundle. They
        // then stay cached across deploys instead of being re-downloaded every
        // time a screen changes.
        advancedChunks: {
          groups: [
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler|react-router)/ },
            { name: 'supabase', test: /node_modules[\/]@supabase/ },
            { name: 'motion', test: /node_modules[\/](gsap|ogl)/ },
          ],
        },
      },
    },
  },
})
