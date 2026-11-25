import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/downloads': 'http://127.0.0.1:4000',
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/');
          if (norm.includes('/src/utils/i18n.ts')) {
            return 'i18n-dict';
          }
          if (norm.includes('/src/data/legalDocuments.ts')) {
            return 'legal-docs';
          }
          if (!norm.includes('/node_modules/')) return undefined;
          if (
            norm.includes('/node_modules/react/') ||
            norm.includes('/node_modules/react-dom/') ||
            norm.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          if (norm.includes('/node_modules/lucide-react/')) {
            return 'icons';
          }
          if (
            norm.includes('/node_modules/socket.io-client/') ||
            norm.includes('/node_modules/engine.io-client/') ||
            norm.includes('/node_modules/@socket.io/')
          ) {
            return 'realtime';
          }
          if (norm.includes('/node_modules/@tauri-apps/')) {
            return 'tauri';
          }
          return undefined;
        },
      },
    },
  },
});
