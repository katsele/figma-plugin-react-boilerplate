---
name: figma-plugin-devmode
description: >-
  Use this skill when a Figma plugin needs Dev Mode, Slides, or Buzz
  support, codegen or inspect capabilities, the Dev Mode focused node, or
  Code Connect. Covers editorType and capabilities manifest wiring, Dev
  Mode's different skipInvisibleInstanceChildren default, the split
  between the Plugin API and the Dev Mode MCP server, and Code Connect
  template files replacing the deprecated React/SwiftUI parsers. Triggers
  on tasks like "add Dev Mode support", "build a codegen plugin", "make an
  inspect panel plugin", "target Figma Slides or Buzz", "should this be an
  MCP call or a plugin", or "set up Code Connect".
---

# Figma Dev Mode and other editor surfaces

This boilerplate's manifest declares `"editorType": ["figma", "figjam"]`.
That's correct for a plugin that edits the canvas, like the Layer Renamer
example. It is not a template to expand from by default. Add `dev`,
`slides`, or `buzz` only when the plugin has actual logic for that
surface.

## editorType: five values, different capability models

Valid values today: `figma`, `figjam`, `dev`, `slides`, `buzz`. Each one
you list is a surface Figma will actually offer the plugin on, with its
own constraints:

- `figma` / `figjam`: full canvas editing. What figma-plugin-api and
  figma-plugin-extend already cover.
- `dev`: Dev Mode. Mostly read. See below.
- `slides`: adds `SLIDE`, `SLIDE_ROW`, `SLIDE_GRID`, and
  `INTERACTIVE_SLIDE_ELEMENT` node types. Only relevant to plugins with
  presentation-specific logic.
- `buzz`: adds the `figma.buzz.*` namespace for managing marketing asset
  templates at scale. After adding `"buzz"` to `editorType`, run
  `npm update` to pull current typings.

`["figjam", "dev"]` is not a supported combination. Don't add `dev`
alongside `figjam` just to "cover more surfaces": check what the plugin
actually needs first.

## Dev Mode is mostly read, not read-only

A Dev Mode plugin (`"editorType": ["dev"]`) can read the document and
modify only `pluginData` and `relaunchData`. It cannot create, delete, or
otherwise mutate nodes the way a `figma`/`figjam` plugin can. A feature
that needs real document mutation belongs on the `figma`/`figjam`
surface, not `dev`.

A few Dev-Mode-specific defaults and APIs to know before writing one:

- `figma.skipInvisibleInstanceChildren` defaults to `true` in Dev Mode and
  `false` in Figma and FigJam (see figma-plugin-perf for what the flag
  does). If a plugin targets both `dev` and `figma`, don't assume
  traversal returns the same nodes in both. Set it explicitly instead of
  relying on the default.
- `figma.currentPage.focusedNode` returns the node currently open in the
  Inspect panel, the Dev Mode analog of `selection`. Use it in
  inspect/codegen plugins to know what the developer is looking at:

  ```ts
  const node = figma.currentPage.focusedNode;
  if (node) {
    // build code or context for this specific node
  }
  ```

- `figma.mode` narrows further inside `dev`: `"inspect"`, `"codegen"`,
  `"linkpreview"`, `"auth"`. Branch on `figma.mode`, not just
  `figma.editorType === "dev"`, once a plugin does more than one thing.

## capabilities: opt into specific Dev Mode surfaces

Valid values: `textreview`, `codegen`, `inspect`, `vscode`. `codegen` is a
capabilities value, not a permissions value (see figma-plugin-security's
permissions list). Declaring it doesn't grant extra document access. It
tells Figma to list the plugin as a code-generation source in the Inspect
panel's Code section, and it requires `codegenLanguages` alongside it:

```json
{
  "editorType": ["dev"],
  "capabilities": ["codegen"],
  "codegenLanguages": [{ "label": "React", "value": "react" }]
}
```

- `codegenPreferences` is optional alongside `codegenLanguages`: extra
  settings or action buttons in the Code panel, scoped per language.
- `inspect` surfaces the plugin inside the Inspect panel itself. Useful
  for pulling context from Jira, GitHub, or an internal API next to a
  selected layer.
- `vscode` makes a Dev Mode plugin usable inside the Dev Mode VS Code
  extension. If declared, use `figma.openExternal()` for links, avoid
  native browser dialogs since they don't exist in that host, and detect
  the host via `figma.vscode`.
- `textreview` is not Dev-Mode-only. It runs under `editorType: "figma"`
  or `"figjam"` with `figma.mode === "textreview"`, for grammar and
  content-review plugins. Don't assume every capability implies `dev`.

## The Dev Mode MCP server is not the Plugin API

Figma also ships a Dev Mode MCP server. It is unrelated to everything
above: no manifest, no `figma.*` namespace, no installable plugin comes
out of it. It's a bridge, over the Model Context Protocol, between a
Figma file you have open and your own coding agent (a tool like this
one). It started as a read-focused surface: design context, code
snippets, variables, components, and screenshots pulled from your open
file into your agent's context window.

Figma's current docs also describe a beta "write to canvas" capability on
the MCP server: structured generation that reuses a file's existing
components and variables, gated to paid Dev and Full seats. Even with
that, it's still a live, one-off bridge to a file open in your own Figma
session, not a way to ship anything to other users.

The distinction that matters for this repo: nothing the MCP server does,
read or write, produces a plugin. A plugin is `manifest.json` plus
`dist/code.js` and `dist/ui.html` (see figma-plugin-publish), installed
by any user, running inside Figma's plugin sandbox (see
figma-plugin-api). If the task is "build a plugin," write Plugin API code
in `src/main.ts`. Reaching for MCP tools instead only affects your own
current session. It ships nothing.

## Code Connect: use template files, not framework parsers

Code Connect maps components in a codebase to components in a Figma file.
It's entirely separate from this Plugin API: no `manifest.json`, no
`editorType`, no `capabilities`.

Code Connect's old framework-specific parsers (React and SwiftUI, which
worked by parsing your code's AST) are deprecated. Figma's own wording:
"Framework-specific parsers will no longer receive updates or support.
Template files are now the only actively maintained way of using Code
Connect." Template files, framework-agnostic
`.figma.ts` files you write explicitly instead of having them parsed, are
now the only maintained method. If asked to wire up Code Connect for a
component, write a template file, not a React-parser config.

## Newer surfaces: know when to reach for them, not their full API

Don't reproduce Figma's API reference here; check it before assuming a
method signature. Reach for these when the task is actually about them:

- **Motion API** (`animationStyles`, `applyAnimationStyle`, and related
  methods): reading or applying Figma's native prototyping animations
  from a plugin.
- **Slots** (`SlotNode`, `componentNode.createSlot()`,
  `slotNode.resetSlot()`): plugins that build or manage component-library
  slot content.
- **Annotations** (`figma.annotations`, `node.annotations`): Dev Mode's
  pinned notes and property callouts. Relevant to `inspect`-capability
  plugins that read or add developer-facing notes on a node.

## Anti-patterns

- Adding `"dev"` to `editorType` because Dev Mode sounds relevant, without
  an actual inspect or codegen use case. A Layer-Renamer-style mutation
  silently can't run there.
- Declaring `"capabilities": ["codegen"]` without `codegenLanguages`. The
  plugin won't register as a code-generation source without it.
- Treating the Dev Mode MCP server's tools as a distribution mechanism.
  They only affect the file open in your own session.
- Writing a new React-parser Code Connect config. Write a template file
  instead.
