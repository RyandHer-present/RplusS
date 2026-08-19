import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/RplusS/ , so assets need that base path.
export default defineConfig({
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
