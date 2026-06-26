/**
 * Kitty graphics-capability detection, shared by avatar rendering and dashboard
 * terminal cleanup. Centralised in this zero-dependency leaf so a single strict
 * rule decides whether kitty-graphics escapes are safe to emit — and so callers
 * never re-inline a `TERM.includes("kitty")` substring check (IC-231).
 */

export function isLikelyKitty(env: NodeJS.ProcessEnv = process.env): boolean {
	// `KITTY_WINDOW_ID` is set unambiguously by kitty. `TERM` must match kitty's
	// terminfo entry exactly so unrelated values like `st-kitty-256color` (a st
	// build that only supports the kitty keyboard protocol, not kitty graphics)
	// do not trigger kitty-graphics escapes and corrupt the image.
	return Boolean(env.KITTY_WINDOW_ID || env.TERM === "xterm-kitty");
}
