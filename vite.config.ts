import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import manifest from './manifest.config.ts';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'es2021',
    rollupOptions: {
      // Extra extension page: one-time microphone permission for voice commands.
      input: { mic: 'mic.html' },
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    hmr: {
      port: 5180,
    },
  },
});
