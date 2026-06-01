import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serve em /<repo>/, então base relativa via env BASE_URL.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_URL || '/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020'
  }
});
