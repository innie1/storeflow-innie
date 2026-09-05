import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Version the icon URLs by their own content.
 *
 * An installed PWA keeps showing the icon it was installed with. The file had
 * a fixed name, so replacing it changed nothing the phone could notice: the
 * URL was identical, the manifest was byte-for-byte the same, and both the
 * HTTP cache and the installed shortcut kept the old image until the app was
 * uninstalled and installed again.
 *
 * Hashing the file into the URL makes a new icon a new URL, which makes the
 * manifest different, which is the signal Chrome's periodic update check
 * needs before it will rebuild the installed app's icon. Nothing to remember
 * to bump by hand -- change the PNG and the version follows.
 */
const iconVersion = createHash("sha256")
  .update(readFileSync(path.resolve(__dirname, "public/icons/icon-512.png")))
  .digest("hex")
  .slice(0, 8);

/** Keep the <link rel="apple-touch-icon"> in index.html on the same version. */
function versionHtmlIcons() {
  return {
    name: "storeflow-version-html-icons",
    transformIndexHtml(html: string) {
      return html.replace(/\/icons\/icon-192\.png(?!\?)/g, `/icons/icon-192.png?v=${iconVersion}`);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [
    react(),
    versionHtmlIcons(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      // Already-installed apps recorded /manifest.json as their manifest URL,
      // so that is the file they re-fetch when checking for updates. Generate
      // it there rather than at the default manifest.webmanifest, or every
      // existing install would poll a 404 and never see a new icon.
      manifestFilename: "manifest.json",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        // Pinned so a changing icon or start_url is never read as a different
        // app. Matches the id Chrome already derived from start_url.
        id: "/",
        name: "StoreFlow",
        short_name: "StoreFlow",
        description: "Offline-first store management system",
        start_url: "/",
        display: "standalone",
        background_color: "#08080f",
        theme_color: "#08080f",
        icons: [
          { src: `/icons/icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `/icons/icon-512.png?v=${iconVersion}`, sizes: "512x512", type: "image/png", purpose: "any" },
          // Android crops to its own shape; without a maskable entry it puts
          // the square icon in a white circle.
          { src: `/icons/icon-512.png?v=${iconVersion}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,webp,jpg,jpeg}"],
        maximumFileSizeToCacheInBytes: 5000000,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
