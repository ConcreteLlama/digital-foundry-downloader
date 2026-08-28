import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(),
    nodePolyfills({
      include: ['events'],
    }),
  ],
  server: {
    host: true,
    port: 5173,
    // Proxy the API through the dev server so it is always same-origin with
    // whatever host the page was loaded from - localhost, 127.0.0.1 or the
    // machine's LAN IP (for testing on a phone). Pointing the UI straight at
    // a fixed backend host instead means every other hostname trips CORS, and
    // the auth cookie becomes cross-site and is dropped, so sign-in silently
    // fails. Paired with VITE_APP_API_URL=/api in environments/.env.development.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:44556",
        changeOrigin: true,
      },
    },
  },
  envDir: "./environments",
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `js/df-content-manager.js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
    },
  },
});
