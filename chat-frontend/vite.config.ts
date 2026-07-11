import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In dev, proxy /api to the local chat-app so there's no CORS/env fuss.
// In prod (Vercel), set VITE_API_BASE_URL to the Render service URL.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
