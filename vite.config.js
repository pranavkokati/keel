import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Keel's own builder app — not to be confused with the Vite projects Keel
// *generates* for users, which are built fresh per-project inside the E2B
// sandbox (see src/lib/sandbox/e2bAdapter.js).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
