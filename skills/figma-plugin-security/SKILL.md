---
name: figma-plugin-security
description: >-
  Use this skill when reviewing or designing the security posture of a Figma
  plugin — manifest permissions, network access (allowedDomains), sandbox
  isolation, postMessage hygiene, untrusted input from the canvas, secrets
  handling, and clientStorage. Triggers on tasks like "review my manifest",
  "should I allow this domain", "is it safe to fetch X", "validate the message
  from the UI", or "store API keys in the plugin".
---

# Figma Plugin security

The plugin runs as two isolated runtimes inside Figma. Treat any data
crossing a boundary — including data read from the canvas — as untrusted.

## Two runtimes, two threat models

- **Sandbox** (`src/main.ts`): runs in Figma's plugin VM. Has `figma.*`. No
  DOM, no `fetch`, no Web APIs. Cannot directly call out to the network.
- **UI iframe** (`src/App.tsx`): standard browser iframe with DOM. Has
  `fetch` only when allowed by `networkAccess`. Cannot call `figma.*`.

They communicate **only** via `postMessage`. Validate every message at the
boundary.

## `networkAccess.allowedDomains` is the network firewall

In `manifest.json`. The boilerplate ships with the safest possible value:

```json
"networkAccess": { "allowedDomains": ["none"] }
```

Meaning: even the UI iframe cannot fetch anywhere. If the plugin needs to
hit an API, list **only** the exact domain(s):

```json
"networkAccess": {
  "allowedDomains": ["https://api.example.com"]
}
```

Avoid wildcards (`"*"`, `"https://*.example.com"`) unless you fully trust
every subdomain. A wildcard turns the plugin into a generic data-exfil
vector if it ever takes user-controlled URLs as input.

## `documentAccess` and `permissions`

- `documentAccess: "dynamic-page"` is the modern default — limits eager
  document loading. The boilerplate ships with this.
- `permissions: ["teamlibrary"]` etc. unlock specific APIs. Add only what
  you actually call.
- `enableProposedApi: true` opens unstable APIs. Use during prototyping;
  **never ship**.

## postMessage validation

`event.data.pluginMessage` from the iframe to the sandbox is a structured
clone of arbitrary user code's input. Type assertions are not enough — the
runtime shape may not match your TS types.

The boilerplate validates by narrowing on the discriminated union:

```ts
function onMessage(event: MessageEvent) {
  const msg = event.data?.pluginMessage as PluginMessage | undefined;
  if (!msg || typeof msg !== "object" || !("type" in msg)) return;
  switch (msg.type) {
    case "plugin:selection": /* msg.nodes is typed */ break;
    // exhaustive
  }
}
```

For input fields with stronger guarantees (numeric ranges, URL parsing),
validate the contents of the variant inside the case arm.

## Treat canvas input as untrusted

Node names, text contents, image data, and URL fields read from the canvas
are user data. Any user — including a hostile collaborator — can put
anything there.

- Never `eval` or `new Function` on canvas data.
- Never inject canvas strings into `innerHTML` in the UI. React's `{value}`
  in JSX is safe; `dangerouslySetInnerHTML` is not.
- If you build URLs from canvas values to fetch, validate scheme, host, and
  path — and remember that the only domains you can hit are the ones in
  `allowedDomains`.

## Secrets and per-user storage

| Storage | Scope | Use for |
|--|--|--|
| `figma.clientStorage` | per-user, per-plugin | preferences, OAuth tokens, last-used inputs |
| `node.setPluginData()` | per-document | document-specific state, **shared with all collaborators** |
| `figma.root.setPluginData()` | per-document, root-level | document-wide state, **shared with all collaborators** |

`setPluginData` is **visible to every collaborator** with file access via
`getPluginData`. Do not put API keys, OAuth tokens, or user emails there.

## Manifest hygiene

A pre-publish review checklist:

- `id` is the real Figma-issued plugin ID, not the boilerplate placeholder.
- `editorType` lists only the editors the plugin actually supports.
- `networkAccess.allowedDomains` is the minimum set, no `*`.
- `enableProposedApi` is **not** present.
- `permissions` lists only APIs the plugin uses.
- The UI bundle does not contain `<script src="https://...">` to a remote
  CDN — Manifest v3 forbids it; the network policy blocks it; ship code
  bundled.

## Anti-patterns

- Sending `figma.root` over the wire to a network endpoint. Even with
  `allowedDomains` set, this exposes the entire document tree to a third
  party — not what users expect from a plugin labeled "renamer".
- Storing secrets in `setPluginData` so they "follow the file."
- Trusting `event.origin` in the UI's message listener. Figma's plugin
  iframe has a generated origin; pin to message shape, not origin.
- Loading a remote `<iframe src="https://...">` into the UI to do work.
  The outer plugin UI is already an iframe; nested foreign iframes are a
  data-exfil hazard and break the spirit of the network policy.
- Disabling `documentAccess: "dynamic-page"` to "make code simpler." It
  trades cold-start memory for convenience and gets you the older deprecated
  ID-based variable/style API.
