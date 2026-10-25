import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // La versión de GitHub Pages se sirve desde /<repo>/ y define BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: { host: true, port: 5174 },
});
