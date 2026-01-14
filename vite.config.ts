import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Root path for custom domain (zip2rep.ca)
  build: {
    outDir: 'dist',
  },
})
