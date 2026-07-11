import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: '/ppms/' keeps asset paths relative so the site works both locally and on
// GitHub Pages (which serves from /<repo-name>/).
export default defineConfig({
  base: '/ppms/',
  plugins: [react()],
  server: { port: 5174 },
})
