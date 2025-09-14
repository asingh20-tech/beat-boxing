import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    resolve: {
    alias: {
      '@stdb': path.resolve(__dirname, '../client/src/module_bindings'),
    },
    },
    server: {
      fs: {
        // allow serving files from the project root (to import client bindings)
        allow: [path.resolve(__dirname, '..')],
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
