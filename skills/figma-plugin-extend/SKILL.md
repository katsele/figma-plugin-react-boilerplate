---
name: figma-plugin-extend
description: >-
  Use this skill when adding new commands, manifest parameters, message types,
  UI screens, or persistent storage to a Figma plugin built on this boilerplate.
  Triggers on tasks like "add a new command", "add a parameter to the manifest",
  "add a new message handler", "wire a button to the plugin code", "persist user
  settings across sessions", or any change that crosses the UI / sandbox
  boundary.
---

# Extending the plugin

The boilerplate has a single example feature (Layer Renamer). Real plugins
grow. Use this skill to add capabilities the right way — preserving the typed
message contract and the runtime separation between UI and sandbox.

## Adding a new UI ↔ sandbox interaction

Every cross-boundary action is a new variant in the discriminated unions in
`src/messages.ts`. Add it on **both** ends and let the exhaustive switch
catch missed cases at compile time.

1. **Add the message type** in `src/messages.ts`:

   ```ts
   // UI → sandbox
   export type UIMessage =
     | ...existing variants
     | { type: "ui:duplicate"; copies: number };

   // Sandbox → UI
   export type PluginMessage =
     | ...existing variants
     | { type: "plugin:duplicate-complete"; createdCount: number };
   ```

2. **Handle it in the sandbox** (`src/main.ts`'s `figma.ui.onmessage` switch):

   ```ts
   case "ui:duplicate":
     void handleDuplicate(msg);
     return;
   ```

   Add the matching async handler. Wrap mutations in try/finally with
   `figma.commitUndo()` and post back a typed result.

3. **Send and receive in the UI** (`src/App.tsx`):

   ```ts
   postToPlugin({ type: "ui:duplicate", copies: 3 });
   // ...
   case "plugin:duplicate-complete":
     setSuccess(`Created ${msg.createdCount}`);
     return;
   ```

The exhaustive `switch(msg.type)` on both ends will produce TypeScript errors
until every variant is handled. That is the point.

## Adding a manifest command with parameters

For quick-action commands invoked from Figma's plugin menu, declare them in
`manifest.json` and read parameters in `main.ts` via `figma.parameters`.

```json
{
  "menu": [
    { "name": "Rename layers", "command": "rename" },
    { "name": "Duplicate selection", "command": "duplicate" }
  ],
  "parameters": [
    { "name": "Copies", "key": "copies", "allowFreeform": true }
  ],
  "parameterOnly": false
}
```

In `main.ts`, branch on `figma.command`:

```ts
if (figma.command === "duplicate") {
  // Run without UI; or open UI with command-specific state.
}
```

## Adding a second UI screen

A 360 × 480 iframe does not need react-router. Use a `useState`-based screen
selector — it adds zero dependencies and is trivial to read.

```tsx
type Screen = "home" | "settings";

const [screen, setScreen] = useState<Screen>("home");

return screen === "home" ? <Home onSettings={() => setScreen("settings")} />
                         : <Settings onBack={() => setScreen("home")} />;
```

Resize the UI when the new screen needs it:

```ts
postToPlugin({ type: "ui:resize", width: 480, height: 600 });
// In main.ts:
case "ui:resize":
  figma.ui.resize(msg.width, msg.height);
  return;
```

## Persisting user settings

`figma.clientStorage` is per-user, per-plugin, async, and survives across
sessions. Use it for preferences (last pattern, last UI size, opened tutorial).

```ts
// Sandbox
const saved = await figma.clientStorage.getAsync("lastPattern");
await figma.clientStorage.setAsync("lastPattern", "Card {n}");
```

Do **not** put secrets in `setPluginData` — that's per-document and shared
with everyone who can open the file. See the figma-plugin-security skill.

## Folder discipline

The boilerplate intentionally keeps `src/` flat. Promote to a folder only
when ≥ 3 sibling files of the same kind exist:

- 3+ React components → `src/components/`
- 3+ pure helpers → `src/utils/`
- 3+ shared type modules → `src/types/`

A single `messages.ts` and a single `App.tsx` do not earn folders. Resist
premature structure — every empty-ish folder is a place a beginner has to
read before writing the next line of code.
