import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;
const root = import.meta.dirname;

/** Keep installers in /public for GitHub downloads without packing them into the .app. */
function omitInstallersFromDist() {
  return {
    name: "omit-installers-from-dist",
    closeBundle() {
      const dist = path.resolve(root, "dist");
      if (!fs.existsSync(dist)) return;
      for (const name of fs.readdirSync(dist)) {
        if (name.endsWith(".dmg") || name.endsWith(".app") || name.endsWith(".exe")) {
          fs.rmSync(path.join(dist, name), { recursive: true, force: true });
        }
      }
    },
  };
}

export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), omitInstallersFromDist()],
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
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
