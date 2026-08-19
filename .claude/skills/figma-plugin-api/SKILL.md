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
Figma's docs are explicit: text without a loaded font throws. Setting
`fontName` only requires loading the new font; setting `characters` requires
loading every font already used across the node's text ranges first.

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
if (variable) frame.setBoundVariable("itemSpacing", variable);
```

`setBoundVariable` takes a `Variable` object, never an ID string (that form
is deprecated and throws under `dynamic-page`), and only for node fields
like `width`, `itemSpacing`, `cornerRadius`, `paddingLeft`, etc. Fills are
not a bindable node field. Bind a paint's color instead and assign the
returned paint back:

```ts
const [paint] = frame.fills as SolidPaint[];
if (variable && paint) {
  frame.fills = [
    figma.variables.setBoundVariableForPaint(paint, "color", variable),
  ];
}
```

The sync setter `node.fillStyleId = ...` is deprecated; use
`setFillStyleIdAsync()` instead. Same for `strokeStyleId`, `effectStyleId`,
`gridStyleId`, and `TextNode.textStyleId`: use their `set...StyleIdAsync()`
counterparts.

## Notifications

Ambient feedback. Cheap, non-blocking, the right way to confirm an action.
Messages are capped at 100 characters (truncated beyond), with a 3000ms
default timeout.

```ts
figma.notify("Renamed 23 layers");
figma.notify("Could not load font", { error: true, timeout: 3000 });
const handle = figma.notify("Working…", { timeout: Infinity });
// ...later
handle.cancel();
```

Full options: `{ timeout, error, onDequeue, button: { text, action } }`.
Returning `false` from `button.action` keeps the toast open.

## Undo grouping

`figma.commitUndo()` commits pending actions to undo history. It does not
perform an undo itself, and by default plugin actions are not committed to
undo history at all. Figma's own docs show it called between sequential
mutations:

```ts
figma.createRectangle();
figma.commitUndo();
figma.createEllipse();
```

This boilerplate's convention (not a documented Figma pattern) is to wrap
multi-mutation handlers in try/finally, so the checkpoint still lands if the
loop throws partway through:

```ts
try {
  for (const node of nodes) node.name = newNameFor(node);
} finally {
  figma.commitUndo();
}
```

`figma.triggerUndo()` reverts to the last `commitUndo()` checkpoint (in the
typings, no live docs page). `figma.saveVersionHistoryAsync(title, desc?)`
is unrelated: it writes to the file's version history panel, not Cmd-Z.

## Events

`figma.on("close", ...)` runs teardown before the sandbox is destroyed,
typically flushing state to `figma.clientStorage`. It is not about removing
other listeners: each plugin invocation gets a fresh sandbox, so listeners
never leak across invocations (this boilerplate's `selectionchange` listener
in `src/main.ts` is intentionally never removed).

```ts
figma.on("close", () => {
  // Async work here is not guaranteed to finish before the sandbox exits.
  // Prefer persisting state on change rather than batching it into close.
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
