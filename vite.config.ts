import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";

// Load package version safely
const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const version = pkg.version || "1.0.0";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["logo.svg"],
      manifest: {
        name: "StoreFlow",
        short_name: "StoreFlow",
        description: "Offline-first store management system",
        start_url: "/",
        display: "standalone",
        background_color: "#08080f",
        theme_color: "#08080f",
        icons: [
          { src: `/logo.svg?v=${version}`, sizes: "any", type: "image/svg+xml" },
          { src: `/icons/icon-192.png?v=${version}`, sizes: "192x192", type: "image/png" },
          { src: `/icons/icon-512.png?v=${version}`, sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webp,jpg,jpeg}"],
        globIgnores: ["**/icons/icon-*.png", "**/logo.svg"],
        maximumFileSizeToCacheInBytes: 5000000,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 2 },
          },
          {
            urlPattern: /logo\.svg|icon-\d+\.png|manifest\.webmanifest|manifest\.json/,
            handler: "NetworkFirst",
            options: {
              cacheName: "pwa-manifest-assets",
              expiration: {
                maxEntries: 10,
              },
            },
          },
          {
            urlPattern: ({ request }) =>
              ["style", "script", "worker", "image", "font"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "assets" },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
