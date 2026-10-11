import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import manifest from './manifest.config.ts';

/**
 * Ship the CLI companion inside every build so a shared download can connect
 * ChatGPT / Claude without npm or the project source: dist/companion/ holds
 * the host files, the standalone installer and double-click launchers, and
 * dist/INSTALL.txt explains both setup paths.
 */
function bundleCompanion(): Plugin {
  const native = fileURLToPath(new URL('./native', import.meta.url));
  let outDir = 'dist';
  return {
    name: 'promptify-bundle-companion',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    async closeBundle() {
      const dest = join(outDir, 'companion');
      await mkdir(dest, { recursive: true });
      for (const file of ['host.mjs', 'telemetry.mjs', 'images.mjs', 'install.mjs']) await copyFile(join(native, file), join(dest, file));
      for (const file of ['Install Companion.command', 'install-companion.sh']) {
        await copyFile(join(native, 'dist-files', file), join(dest, file));
        await chmod(join(dest, file), 0o755);
      }
      await copyFile(join(native, 'dist-files', 'INSTALL.txt'), join(outDir, 'INSTALL.txt'));
    },
  };
}

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [react(), crx({ manifest }), bundleCompanion()],
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
