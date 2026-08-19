---
name: figma-plugin-publish
description: >-
  Use this skill when taking a Figma plugin from working locally to
  published on the Figma Community or an organization. Covers getting a
  real plugin ID and replacing REPLACE_WITH_YOUR_PLUGIN_ID, what npm run
  build must produce before you publish, private vs public vs org-only
  publishing, versioning, and Figma's review process. Triggers on tasks
  like "publish this plugin", "how do I get a plugin ID", "submit to the
  Figma Community", "publish privately to my org", "what does Figma
  review", or "prepare the plugin for release".
---

# Publishing a Figma plugin

This boilerplate ships with a placeholder plugin ID and no publish
configuration. Local development ("Import plugin from manifest…") works
fine with the placeholder. Publishing, in any form, does not.

## Getting a real plugin ID

The `id` in `manifest.json` is assigned by Figma, not chosen by you. Two
ways to get one:

- Start the publish flow for real: in Figma desktop, **Plugins > Manage
  plugins**, find this plugin under Development, then **Publish**. The
  first time you publish, Figma generates an ID and has you paste it into
  `manifest.json`.
- Mint one ahead of time instead: **Plugins > Development > New Plugin…**,
  create a throwaway plugin from any template, copy the `id` Figma put in
  its manifest, then discard the template plugin and paste that ID into
  this repo's `manifest.json`.

Either way, replace `REPLACE_WITH_YOUR_PLUGIN_ID` with the real value
before you publish. Leaving the placeholder is only a problem at publish
time. Local dev never validates it.

## What the publish modal asks for

Beyond the manifest, Figma's publish flow collects the actual listing
content: name, tagline, a longer description, a category, an icon
(128x128), a thumbnail (1920x1080), and a support contact. A playground
file and up to nine carousel images or videos are optional. None of this
lives in the repo; have the copy and images ready before you start.

## What `npm run build` must produce first

`manifest.json` points `main` at `dist/code.js` and `ui` at `dist/ui.html`.
Figma's local "Development" registration reads those files straight off
your disk. It's the same mechanism that powers `npm run dev`'s
auto-reload (see figma-plugin-perf). Publishing rides on that same
registration: Figma packages whatever is currently in `dist/` at the
moment you click **Publish** or **Publish new version**, not anything
from git or CI.

This repo's `.gitignore` excludes `dist/`. That's a source-control choice,
not a Figma requirement, but it has two consequences:

- A fresh clone has no `dist/` until someone runs `npm install && npm run
  build`. There's nothing to publish until then.
- Run a clean `npm run build` (and `npm run typecheck`) immediately before
  publishing. Don't rely on whatever a lingering `npm run dev` watch
  session happened to leave behind. Publish reads the files on disk
  exactly as they are, stale or half-written included.

## Pre-publish manifest checklist

See the figma-plugin-security skill for the full manifest hygiene
checklist and for why the domain list is public. Two things worth adding
at publish time specifically:

- `enableProposedApi` isn't just risky to ship. Figma's own docs say it
  "will not work in published plugins." A leftover prototyping flag can
  break the published build, not merely widen its attack surface.
- If you set `networkAccess.reasoning`, it's displayed on the Community
  page too, right next to the domain list. Write it as user-facing copy,
  not an internal note to yourself.

## Private, public, and org-only

- **Public (Community)**: goes through Figma's plugin and widget review.
  First-time review can take up to about two weeks. After that initial
  approval, updates publish immediately with no further review.
- **Private to your organization**: same publish flow, but on the final
  details step set **Publish to** to your organization instead of
  Community. This skips Figma's review entirely. It requires an
  Organization or Enterprise plan. Any org member can publish a private
  plugin; only org admins can publish a *public* plugin under the org's
  profile.
- Only the plugin's original publisher can change its access level later
  (private to public or back), and only by publishing an update.

The publish flow also includes an optional data security disclosure form.
Figma reviews the answers as part of the timeline above.

## Versioning and updates

Publish updates from **Plugins > Manage plugins > [your plugin] > Publish
new version**. There's no per-user version pinning: everyone gets the
latest version and there's no user-facing rollback. To "revert," publish
the older code again as a new version. Release notes and listing details
(description, images, tagline) can be edited independently of shipping a
code update.

If you turn on paid distribution, the pricing model (one-time vs
subscription) and the payee are permanent once set. A paid plugin can be
delisted later but not unpublished.

## Anti-patterns

- Leaving `enableProposedApi: true` in "just for this one release."
- Clicking Publish against a `dist/` left over from an old build instead
  of running a fresh `npm run build` first.
- Widening `allowedDomains` right before publishing without checking
  figma-plugin-security's guidance on keeping the list minimal.
- Assuming committing `dist/` to git matters for publishing. Figma never
  reads git history. It reads local disk at the moment you click Publish.
