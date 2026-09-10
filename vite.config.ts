import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
const root = import.meta.dirname;
const prod = process.env.NODE_ENV === "production";

/** Ship only icon/logo. Never pack the DMG or README screenshots into the .app. */
function appPublicAssets() {
  return {
    name: "app-public-assets",
    closeBundle() {
      const dist = path.resolve(root, "dist");
      const pub = path.resolve(root, "public");
      if (!fs.existsSync(dist)) return;
      for (const name of ["icon.png", "logo.png"]) {
        const from = path.join(pub, name);
        if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dist, name));
      }
      for (const name of fs.readdirSync(dist)) {
        if (name.endsWith(".dmg") || name.endsWith(".app") || name.endsWith(".exe") || name === "screenshots") {
          fs.rmSync(path.join(dist, name), { recursive: true, force: true });
        }
      }
    },
  };
}

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), appPublicAssets()],
  publicDir: prod ? false : "public",
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
    },
  },
  build: {
    target: "es2022",
    minify: "oxc",
    cssMinify: "lightningcss",
    cssCodeSplit: false,
    sourcemap: false,
    assetsInlineLimit: 4096,
    reportCompressedSize: false,
    modulePreload: false,
    rolldownOptions: {
      treeshake: true,
      output: {
        codeSplitting: false,
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
