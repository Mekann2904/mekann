import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Autoresearch tool protocol Module.
 * Keeps Pi tool registration semantics in one seam so index.ts supplies only
 * tool-specific Interface data and handler Implementation.
 */
export interface AutoresearchToolSpec {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: unknown;
	execute: (...args: any[]) => unknown;
}

export function autoresearchTool(spec: AutoresearchToolSpec): Parameters<ExtensionAPI["registerTool"]>[0] {
	return spec as Parameters<ExtensionAPI["registerTool"]>[0];
}
