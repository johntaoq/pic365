import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Isolated preview: no application middleware, authentication or generation API.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
});
