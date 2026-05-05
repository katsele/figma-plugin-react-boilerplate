# Figma Plugin Boilerplate

A modern Figma plugin starter. Vite 7 + React 19 + TypeScript, Manifest v3,
`documentAccess: "dynamic-page"`, single-file UI bundle. The example feature
is a **Layer Renamer**.

## Setup

```sh
npm install
```

Open Figma's plugin developer portal, register a plugin, copy its ID, and
replace `REPLACE_WITH_YOUR_PLUGIN_ID` in `manifest.json`. For purely local
development you can leave the placeholder.

## Develop

```sh
npm run dev
```

Two `vite build --watch` processes run in parallel — one for the sandbox
(`dist/code.js`), one for the UI (`dist/ui.html`). In Figma **desktop**:

1. **Plugins → Development → Import plugin from manifest…**
2. Select this directory's `manifest.json`.
3. **Plugins → Development → Figma Plugin Boilerplate**.

Edit `src/` — Figma auto-reloads on file change. If a UI edit doesn't show,
close the plugin window and reopen (Figma caches the iframe HTML).

## Build

```sh
npm run build
npm run typecheck
```

Outputs `dist/code.js` (single IIFE) and `dist/ui.html` (self-contained,
JS+CSS inlined).

## Project layout

```
manifest.json          Manifest v3, references dist/code.js + dist/ui.html
vite.config.ts         Mode-switched: --mode plugin | --mode ui
tsconfig.{plugin,ui}   Two TS projects — sandbox has no DOM, UI has no figma
index.html             Vite UI entry, renamed to ui.html post-build
src/
  main.ts              Plugin sandbox: figma.* API, runs in Figma's VM
  ui.tsx               React 19 createRoot entry
  App.tsx              Layer Renamer UI (single component)
  ui.css               Uses Figma theme CSS vars (--figma-color-*)
  messages.ts          Discriminated union: typed UI ↔ sandbox contract
.claude/skills/        Four skills that load when Claude Code opens this repo
```

## Claude skills

If you use Claude Code, these load automatically from `.claude/skills/`:

- **figma-plugin-extend** — adding commands, message types, screens, storage
- **figma-plugin-api** — selection, traversal, mutation, undo, events
- **figma-plugin-perf** — `dynamic-page`, `loadAsync`, batching, bundle size
- **figma-plugin-security** — `allowedDomains`, sandbox isolation, secrets

Read each `SKILL.md` for what it covers.

## Links

- [Figma Plugin docs](https://developers.figma.com/docs/plugins/)
- [Plugin API reference](https://developers.figma.com/docs/plugins/api/api-reference/)
- [Manifest reference](https://developers.figma.com/docs/plugins/manifest)
- [Official samples](https://github.com/figma/plugin-samples)
