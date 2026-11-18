import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    strictPort: true,
    proxy: {
      '/actuator/health': { target: process.env.BACKEND_URL ?? 'http://localhost:8080' },
      '/api': { target: process.env.BACKEND_URL ?? 'http://localhost:8080' },
    },
  },
  test: { environment: 'jsdom' },
});
