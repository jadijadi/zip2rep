import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/zip2rep/', // GitHub Pages base path - change to '/' if using custom domain
  build: {
    outDir: 'dist',
  },
})
