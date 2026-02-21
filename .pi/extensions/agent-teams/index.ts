/**
 * path: .pi/extensions/agent-teams/index.ts
 * role: Agent Teams extension entrypoint for local extension discovery.
 * why: pi local discovery loads subdirectory extensions via index.ts.
 * related: .pi/extensions/agent-teams/extension.ts, package.json, .pi/extensions/search/index.ts
 */

export { default } from "./extension.js";

