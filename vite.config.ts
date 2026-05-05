import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = import.meta.dirname;

// Vite's app mode emits the entry HTML as `dist/index.html`. The Figma manifest
// references `dist/ui.html`. This post-build hook bridges the two conventions.
function renameUiHtml(): Plugin {
  return {
    name: "rename-ui-html",
    apply: "build",
    closeBundle() {
      const from = resolve(ROOT, "dist/index.html");
      const to = resolve(ROOT, "dist/ui.html");
      if (existsSync(from)) renameSync(from, to);
    },
  };
}

export default defineConfig(({ mode }) => {
  if (mode === "plugin") {
    // Sandbox bundle. Figma's plugin runtime is a minimal JS environment with no
    // DOM, no fetch, and no ES module support, so we emit a single IIFE script.
    return {
      build: {
        emptyOutDir: false,
        outDir: "dist",
        target: "es2017",
        sourcemap: false,
        lib: {
          entry: resolve(ROOT, "src/main.ts"),
          formats: ["iife"],
          name: "plugin",
          fileName: () => "code.js",
        },
        rollupOptions: { output: { extend: true } },
      },
    };
  }

  // UI bundle. The iframe has no network access (allowedDomains: ["none"]), so
  // viteSingleFile inlines all JS+CSS into a single self-contained HTML file.
  return {
    plugins: [react(), viteSingleFile(), renameUiHtml()],
    build: {
      emptyOutDir: false,
      outDir: "dist",
      target: "es2020",
      cssCodeSplit: false,
      assetsInlineLimit: 100_000_000,
      rollupOptions: {
        input: resolve(ROOT, "index.html"),
      },
    },
  };
});
