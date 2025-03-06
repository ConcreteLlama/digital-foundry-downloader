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
