import type { NodeDigest, PluginMessage, UIMessage } from "./messages";
import { isUIMessage } from "./messages";

const SELECTION_DIGEST_LIMIT = 500;

// Performance default for traversal. Hidden instance children are typically
// just visual variants of the same component — skipping them cuts findAll() cost
// dramatically on large files. See the figma-plugin-perf skill for context.
figma.skipInvisibleInstanceChildren = true;

figma.showUI(__html__, {
  width: 360,
  height: 480,
  themeColors: true,
  title: "Layer Renamer",
});

function digestSelection(): NodeDigest[] {
  return figma.currentPage.selection
    .slice(0, SELECTION_DIGEST_LIMIT)
    .map((node) => ({ id: node.id, name: node.name, type: node.type }));
}

function postToUI(msg: PluginMessage): void {
  figma.ui.postMessage(msg);
}

postToUI({ type: "plugin:selection", nodes: digestSelection() });

figma.on("selectionchange", () => {
  postToUI({ type: "plugin:selection", nodes: digestSelection() });
});

function applyPattern(
  oldName: string,
  index: number,
  type: string,
  pattern: string,
  find: string | undefined,
  replace: string | undefined,
): string {
  let next = pattern
    .replaceAll("{n}", String(index + 1))
    .replaceAll("{type}", type.toLowerCase())
    .replaceAll("{name}", oldName);
  if (find) {
    next = next.split(find).join(replace ?? "");
  }
  return next;
}

async function collectTargets(
  includeChildren: boolean,
): Promise<readonly SceneNode[]> {
  const top = figma.currentPage.selection;
  if (!includeChildren) return top;

  // Required under documentAccess: "dynamic-page" before traversing pages.
  // No-op for the page the user is already viewing, but the explicit await
  // makes the pattern correct for any page you might switch to.
  await figma.currentPage.loadAsync();

  const all: SceneNode[] = [];
  for (const node of top) {
    all.push(node);
    if ("findAll" in node) {
      all.push(...node.findAll(() => true));
    }
  }
  return all;
}

async function handleRename(
  msg: Extract<UIMessage, { type: "ui:rename" }>,
): Promise<void> {
  const { pattern, includeChildren, find, replace } = msg;
  if (!pattern.trim()) {
    postToUI({ type: "plugin:error", message: "Pattern cannot be empty." });
    return;
  }
  try {
    const targets = await collectTargets(includeChildren);
    if (targets.length === 0) {
      postToUI({ type: "plugin:error", message: "No layers selected." });
      return;
    }
    targets.forEach((node, i) => {
      node.name = applyPattern(node.name, i, node.type, pattern, find, replace);
    });
    figma.notify(`Renamed ${targets.length} layer${targets.length === 1 ? "" : "s"}`);
    postToUI({ type: "plugin:rename-complete", renamedCount: targets.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    postToUI({ type: "plugin:error", message });
  } finally {
    // Bundle every node mutation in this handler into a single undo step.
    figma.commitUndo();
  }
}

// `msg` is a structured clone crossing the UI → sandbox trust boundary — the
// runtime shape may not match the `UIMessage` type it's annotated with, and
// this handler is the one holding figma.* access. Validate before touching
// it. See the figma-plugin-security skill ("Validate every message at the
// boundary").
figma.ui.onmessage = (msg: unknown): void => {
  if (!isUIMessage(msg)) {
    postToUI({
      type: "plugin:error",
      message: "Received a malformed message from the UI.",
    });
    return;
  }
  switch (msg.type) {
    case "ui:ready":
    case "ui:request-selection":
      postToUI({ type: "plugin:selection", nodes: digestSelection() });
      return;
    case "ui:rename":
      void handleRename(msg);
      return;
    case "ui:close":
      figma.closePlugin();
      return;
    default: {
      // Exhaustiveness guard. Add a variant to UIMessage without a case
      // above and `msg` stops being `never` here, so tsc fails the build.
      const unhandled: never = msg;
      void unhandled;
      return;
    }
  }
};
