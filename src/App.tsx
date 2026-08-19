import { useEffect, useState } from "react";
import type { NodeDigest, PluginMessage, UIMessage } from "./messages";

const MAX_PREVIEW = 10;
const SELECTION_LIMIT = 500;

// Send a typed message to the plugin sandbox. The `parent.postMessage`
// envelope shape (`{ pluginMessage }`) is what figma.ui.onmessage unwraps.
//
// Target origin is "*" on purpose. Figma's docs recommend pinning this to
// "https://www.figma.com", but that guidance is scoped to plugins that
// navigate their iframe to a custom hosted URL. The default
// `figma.showUI(__html__)` setup this boilerplate uses is a *null-origin*
// iframe — Figma's own docs and the official figma/plugin-samples repo both
// use "*" for that case, since the parent frame's real origin (desktop app,
// staging, embeds) isn't a documented contract to pin against. Revisit only
// if this UI starts navigating to a custom https:// URL.
function postToPlugin(msg: UIMessage): void {
  parent.postMessage({ pluginMessage: msg }, "*");
}

export function App() {
  const [selection, setSelection] = useState<NodeDigest[]>([]);
  const [pattern, setPattern] = useState("Layer {n}");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [includeChildren, setIncludeChildren] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const msg = event.data?.pluginMessage as PluginMessage | undefined;
      if (!msg || typeof msg !== "object" || !("type" in msg)) return;
      switch (msg.type) {
        case "plugin:selection":
          setSelection(msg.nodes);
          return;
        case "plugin:rename-complete":
          setRenaming(false);
          setSuccess(msg.renamedCount);
          setError(null);
          return;
        case "plugin:error":
          setRenaming(false);
          setError(msg.message);
          return;
        default: {
          // Exhaustiveness guard. Add a variant to PluginMessage without a
          // case above and `msg` stops being `never` here, so tsc fails.
          const unhandled: never = msg;
          void unhandled;
          return;
        }
      }
    }
    window.addEventListener("message", onMessage);
    postToPlugin({ type: "ui:ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const trimmedPattern = pattern.trim();
  const patternValid = trimmedPattern.length > 0;
  const tooLarge = selection.length >= SELECTION_LIMIT;
  const canRename = patternValid && selection.length > 0 && !renaming;

  function previewName(node: NodeDigest, index: number): string {
    // With child layers included, main.ts's collectTargets() numbers {n}
    // across the flattened selection + descendants — an order this preview
    // (top-level selection only) can't reproduce. Showing a guessed number
    // here would misrepresent what Rename actually produces, so fall back
    // to a placeholder (see the hint rendered under the preview header).
    const n = includeChildren ? "?" : String(index + 1);
    let next = trimmedPattern
      .replaceAll("{n}", n)
      .replaceAll("{type}", node.type.toLowerCase())
      .replaceAll("{name}", node.name);
    if (find) next = next.split(find).join(replace);
    return next;
  }

  function handleRename() {
    if (!canRename) return;
    setRenaming(true);
    setSuccess(null);
    setError(null);
    postToPlugin({
      type: "ui:rename",
      pattern: trimmedPattern,
      includeChildren,
      find: find || undefined,
      replace: find ? replace : undefined,
    });
  }

  return (
    <main>
      <header className="title">
        <h1>Layer Renamer</h1>
        <p className="hint">
          Tokens: <code>{"{n}"}</code> index, <code>{"{type}"}</code> type,{" "}
          <code>{"{name}"}</code> original name.
        </p>
      </header>

      <label>
        Pattern
        <input
          type="text"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          disabled={renaming}
          autoFocus
          spellCheck={false}
        />
      </label>

      <details>
        <summary>Find &amp; replace (optional)</summary>
        <label>
          Find
          <input
            type="text"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            disabled={renaming}
            spellCheck={false}
          />
        </label>
        <label>
          Replace with
          <input
            type="text"
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            disabled={renaming}
            spellCheck={false}
          />
        </label>
      </details>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={includeChildren}
          onChange={(e) => setIncludeChildren(e.target.checked)}
          disabled={renaming}
        />
        Include child layers
      </label>

      {error && (
        <div className="banner banner--error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {success !== null && !error && (
        <div className="banner banner--success" role="status">
          Renamed {success} layer{success === 1 ? "" : "s"}.
        </div>
      )}

      {selection.length === 0 ? (
        <p className="empty">Select layers in Figma to rename.</p>
      ) : (
        <section className="preview">
          <header>
            <strong>Preview</strong>
            <span className="count">
              {selection.length}
              {tooLarge ? "+" : ""} selected
              {tooLarge ? " (capped)" : ""}
            </span>
          </header>
          {includeChildren && trimmedPattern.includes("{n}") && (
            <p className="hint">
              {"{n}"} numbers the full set including child layers, so exact
              values only appear after renaming.
            </p>
          )}
          <ol>
            {selection.slice(0, MAX_PREVIEW).map((node, i) => (
              <li key={node.id}>
                <span className="old">{node.name}</span>
                <span className="arrow" aria-hidden="true">→</span>
                <span className="new">{previewName(node, i)}</span>
              </li>
            ))}
            {selection.length > MAX_PREVIEW && (
              <li className="more">+ {selection.length - MAX_PREVIEW} more</li>
            )}
          </ol>
        </section>
      )}

      <footer>
        <button
          type="button"
          onClick={() => postToPlugin({ type: "ui:close" })}
        >
          Close
        </button>
        <button
          type="button"
          className="primary"
          onClick={handleRename}
          disabled={!canRename}
        >
          {renaming ? "Renaming…" : "Rename"}
        </button>
      </footer>
    </main>
  );
}
