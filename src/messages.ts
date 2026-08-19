// Shared message contract between the plugin sandbox (main.ts) and the React UI
// (App.tsx). This file is the only module imported by both runtimes — keep it
// pure data, no environment-specific imports.

export interface NodeDigest {
  id: string;
  name: string;
  type: string;
}

// UI → sandbox
export type UIMessage =
  | { type: "ui:ready" }
  | { type: "ui:request-selection" }
  | {
      type: "ui:rename";
      pattern: string;
      includeChildren: boolean;
      find?: string;
      replace?: string;
    }
  | { type: "ui:close" };

// Runtime guard for messages arriving from the UI iframe into the sandbox.
// `msg` is a structured clone of arbitrary iframe content crossing a trust
// boundary — a `UIMessage` type annotation alone doesn't guarantee the
// runtime shape matches it. See the figma-plugin-security skill: "Validate
// every message at the boundary" / "Type assertions are not enough."
export function isUIMessage(msg: unknown): msg is UIMessage {
  if (!msg || typeof msg !== "object" || !("type" in msg)) return false;
  const obj = msg as Record<string, unknown>;
  const { type } = obj;
  if (typeof type !== "string") return false;

  switch (type) {
    case "ui:ready":
    case "ui:request-selection":
    case "ui:close":
      return true;
    case "ui:rename":
      return (
        typeof obj.pattern === "string" &&
        typeof obj.includeChildren === "boolean" &&
        (obj.find === undefined || typeof obj.find === "string") &&
        (obj.replace === undefined || typeof obj.replace === "string")
      );
    default:
      return false;
  }
}

// Sandbox → UI
export type PluginMessage =
  | { type: "plugin:selection"; nodes: NodeDigest[] }
  | { type: "plugin:rename-complete"; renamedCount: number }
  | { type: "plugin:error"; message: string };
