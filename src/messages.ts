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

// Sandbox → UI
export type PluginMessage =
  | { type: "plugin:selection"; nodes: NodeDigest[] }
  | { type: "plugin:rename-complete"; renamedCount: number }
  | { type: "plugin:error"; message: string };
