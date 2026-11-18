import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    strictPort: true,
    proxy: {
      '/api': { target: process.env.BACKEND_URL ?? 'http://localhost:3000' },
    },
  },
  test: { environment: 'jsdom' },
});
