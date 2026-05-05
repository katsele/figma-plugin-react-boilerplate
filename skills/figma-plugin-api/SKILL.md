---
name: figma-plugin-api
description: >-
  Use this skill when reading or modifying Figma documents from a plugin —
  selection, traversal, node creation, fills, auto-layout, variables, styles,
  events, undo, notifications, and the typed UI/sandbox postMessage protocol.
  Triggers on tasks like "find all text nodes", "set fills on a frame", "create
  an auto-layout frame", "listen to selectionchange", "send a message to the
  UI", or any code touching figma.* APIs.
---

# Figma Plugin API patterns

The plugin runs in two runtimes: the **sandbox** (`src/main.ts`, has `figma`,
no DOM, no `fetch`) and the **UI iframe** (`src/App.tsx`, has DOM, no
`figma`). They communicate only via `postMessage` and the typed contract in
`src/messages.ts`.

## The typed message contract — single source of truth

Every cross-boundary action is a discriminated union variant. Both sides
import from `messages.ts`. Switch exhaustively on `msg.type` and let
TypeScript catch missing cases.

```ts
// In main.ts:
figma.ui.onmessage = (msg: UIMessage): void => {
  switch (msg.type) {
    case "ui:rename": void handleRename(msg); return;
    // ...exhaustive
  }
};

// In App.tsx:
parent.postMessage({ pluginMessage: { type: "ui:rename", ... } }, "*");
```

Always wrap UI-emitted messages in `{ pluginMessage: … }`. Figma unwraps that
envelope into `figma.ui.onmessage`'s argument.

## Selection

```ts
const sel = figma.currentPage.selection; // readonly SceneNode[]
if (sel.length === 0) { figma.notify("Select something first"); return; }

figma.on("selectionchange", () => {
  // pushed live to the UI in this boilerplate
});
```

Never assume non-empty. The user can deselect at any time.

## Traversal

```ts
figma.skipInvisibleInstanceChildren = true; // perf default

await figma.currentPage.loadAsync(); // required under documentAccess: "dynamic-page"

const textNodes = figma.currentPage.findAll(
  (node) => node.type === "TEXT",
) as TextNode[];

// On a single subtree:
const childFrames = (frame as FrameNode).findAll((n) => n.type === "FRAME");
```

`findAll(predicate)` walks descendants of any node that has children. For
multi-page work, await `loadAsync()` per page or `loadAllPagesAsync()` once.

## Node creation and mutation

Set layout properties before adding children. Some properties (e.g. an
instance's `children`) are read-only — TypeScript will tell you.

```ts
const frame = figma.createFrame();
frame.layoutMode = "VERTICAL";
frame.itemSpacing = 8;
frame.paddingTop = frame.paddingBottom = 16;
frame.resize(320, 200);

const text = figma.createText();
await figma.loadFontAsync({ family: "Inter", style: "Regular" });
text.fontName = { family: "Inter", style: "Regular" };
text.characters = "Hello";

frame.appendChild(text);
figma.currentPage.appendChild(frame);
figma.viewport.scrollAndZoomIntoView([frame]);
```

Always `await figma.loadFontAsync(...)` before creating or mutating text.
Figma's docs are explicit: text without a loaded font throws.

## Fills, strokes, and effects

Replace the array, never mutate it in place — Figma snapshots reads.

```ts
frame.fills = [{ type: "SOLID", color: { r: 0.1, g: 0.6, b: 1 }, opacity: 1 }];
frame.strokes = [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }];
frame.cornerRadius = 8;
```

## Variables and styles

Under `documentAccess: "dynamic-page"`, prefer object refs over IDs. Use the
async getters and apply to nodes via `setBoundVariable`.

```ts
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const variable = await figma.variables.getVariableByIdAsync(varId);
if (variable) frame.setBoundVariable("fills", variable);
```

Style methods that take string IDs (`fillStyleId =`, `setFillStyleIdAsync`)
are deprecated under `dynamic-page` — use the async object-based variants.

## Notifications

Ambient feedback. Cheap, non-blocking, the right way to confirm an action.

```ts
figma.notify("Renamed 23 layers");
figma.notify("Could not load font", { error: true, timeout: 3000 });
const handle = figma.notify("Working…", { timeout: Infinity });
// ...later
handle.cancel();
```

## Undo grouping

A user pressing Cmd-Z should undo the entire plugin action in one step, not
node by node. Wrap multi-mutation handlers in try/finally and call
`figma.commitUndo()`:

```ts
try {
  for (const node of nodes) node.name = newNameFor(node);
} finally {
  figma.commitUndo();
}
```

## Events

Always remove listeners on close to avoid leaks across plugin invocations.

```ts
const onSelChange = () => { /* ... */ };
figma.on("selectionchange", onSelChange);

figma.on("close", () => {
  figma.off("selectionchange", onSelChange);
});
```

## Closing

`figma.closePlugin(message?)` exits the plugin. Pass an optional toast
message that appears once the iframe is gone.

```ts
case "ui:close":
  figma.closePlugin("Done!");
  return;
```

## Anti-patterns

- Synchronously mutating thousands of nodes in a tight loop without batching
  — coalesce reads, group writes, undo once.
- Assuming `figma.currentPage` properties are loaded under `dynamic-page` —
  await `loadAsync()` first.
- Mutating fill/stroke arrays in place. Always assign a new array.
- Setting text properties without first awaiting `figma.loadFontAsync`.
- Forgetting `figma.commitUndo()` — users hit Cmd-Z and only the last
  mutation undoes.
