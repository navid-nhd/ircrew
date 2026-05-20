import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // crew.iranair.com is flaky enough that the server-side withFreshSession
        // + per-axios retry loop can legitimately spend 2-3 minutes on a single
        // /api/login. The default 120s proxy timeout was killing the socket
        // before the proxy could respond, which the client then (correctly)
        // labelled as a truncated response. Five minutes covers worst case.
        timeout: 300_000,
        proxyTimeout: 300_000,
      },
    },
  },
});
