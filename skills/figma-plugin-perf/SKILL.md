---
name: figma-plugin-perf
description: >-
  Use this skill when a Figma plugin is slow, freezes Figma, runs out of
  memory, or processes many nodes. Triggers on tasks like "make my plugin
  faster", "optimize the traversal", "the plugin freezes on large files",
  "iterate over every layer", "use dynamic-page", "loadAsync",
  "skipInvisibleInstanceChildren", or "batch updates".
---

# Figma Plugin performance

Plugins run on Figma's main thread. A slow plugin freezes the canvas. The
boilerplate's manifest sets `documentAccess: "dynamic-page"` — that choice
unlocks the rest of this skill's recommendations.

## `documentAccess: "dynamic-page"`

In `manifest.json`. With this flag set, Figma does not eagerly load every
page into the plugin's memory at startup — pages load on demand. This is the
default for new plugins and dramatically reduces cold-start cost on large
files.

Cost: you must `await page.loadAsync()` before reading the page's
`children`, `findAll`, or other content properties.

```ts
await figma.currentPage.loadAsync();
const all = figma.currentPage.findAll(() => true);
```

For multi-page traversals:

```ts
await figma.loadAllPagesAsync(); // once
for (const page of figma.root.children) {
  // read page.children freely
}
```

The async loaders are idempotent — calling on an already-loaded page is a
no-op.

## Skip invisible instance children

```ts
figma.skipInvisibleInstanceChildren = true;
```

Set early in `main.ts`. Hidden children inside component instances are
typically just visual variants. Skipping them is usually what you want and
cuts `findAll()` walks by 10–100x on heavy files.

## Batch reads, batch writes

Each `figma.*` API call crosses a sandbox boundary. Cheap individually,
expensive in tight loops. Coalesce.

Bad:

```ts
for (const node of nodes) {
  if (node.fills.length === 0) node.fills = [BLUE_FILL]; // O(n) reads + writes
}
```

Better — read once, decide, write once per node:

```ts
const updates = nodes.filter((n) => n.fills.length === 0);
for (const node of updates) node.fills = [BLUE_FILL];
```

For very large mutations, group them into a single undo step with
`figma.commitUndo()` — the user undoes once, and Figma can also batch the
internal redraw.

## `figma.clientStorage` is async

```ts
const last = await figma.clientStorage.getAsync("lastPattern");
await figma.clientStorage.setAsync("lastPattern", value);
```

Don't block on it from a hot path. Fetch settings once on plugin start, hold
them in memory, and persist on change.

## Don't `console.log` huge node trees

Figma's plugin devtools serialize logged values. Logging `figma.root` or a
deep frame can lock devtools for seconds. Log node IDs and sizes instead:

```ts
console.log(`page ${page.id}: ${page.children.length} children`);
```

## Keep the UI bundle small

The UI HTML is fully inlined. Every dependency you `npm install --save`
ships in `dist/ui.html`. Figma must parse that HTML on every plugin open.

Defaults the boilerplate enforces:

- React 19 (~50 KB minified+gzipped) — the only UI library
- No `react-router` — at 360 × 480, `useState` for screens is enough
- No `lodash` — five-method use cases are five lines of vanilla JS
- No CSS framework — Figma exposes theme vars via `themeColors: true`; just
  use them

Before adding a UI dependency, weigh: does it earn its weight after gzip and
parse on every cold open?

## Dev workflow

`npm run dev` runs two `vite build --watch` processes via `concurrently`.
Figma desktop watches `dist/code.js` and `dist/ui.html` for changes and
auto-reloads the plugin.

If a UI change does not appear: close the plugin window in Figma and reopen.
Figma caches `ui.html` for the lifetime of an iframe instance.

If `code.js` does not seem to update: check the plugin terminal output — a
type error in `main.ts` will fail the build silently from the user's
perspective, since Figma keeps running the last good `code.js`.

## When to optimize

Profile first. The Figma plugin devtools show frame timings. If the plugin
is fast enough on a 5,000-node file, you do not need to micro-optimize a
1,000-node selection. Premature optimization in plugins usually means
over-engineering the message contract.
