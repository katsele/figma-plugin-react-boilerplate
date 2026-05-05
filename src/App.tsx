import { useEffect, useState } from "react";
import type { NodeDigest, PluginMessage, UIMessage } from "./messages";

const MAX_PREVIEW = 10;
const SELECTION_LIMIT = 500;

// Send a typed message to the plugin sandbox. The `parent.postMessage`
// envelope shape (`{ pluginMessage }`) is what figma.ui.onmessage unwraps.
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
    let next = trimmedPattern
      .replaceAll("{n}", String(index + 1))
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
