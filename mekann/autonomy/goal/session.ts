import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

type PersistedSessionManager = ExtensionContext["sessionManager"] & {
  isPersisted?: () => boolean;
};

export function isPersistedSession(ctx: ExtensionContext): boolean {
  const sessionManager: PersistedSessionManager = ctx.sessionManager;
  return sessionManager.isPersisted?.() === true;
}
