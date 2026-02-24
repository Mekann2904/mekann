/**
 * @abdd.meta
 * path: .pi/extensions/search/tree-sitter/index.ts
 * role: Public API for tree-sitter integration
 * why: Provide unified exports for tree-sitter loader functionality
 * related: .pi/extensions/search/tree-sitter/loader.ts, .pi/extensions/search/repograph/parser.ts
 * public_api: All exports from loader.ts
 * invariants: None (re-exports only)
 * side_effects: None
 * failure_modes: None
 * @abdd.explain
 * overview: Public API module for tree-sitter integration
 * what_it_does:
 * - Re-exports all loader functions for external use
 * - Provides single entry point for tree-sitter functionality
 * why_it_exists:
 * - Encapsulate tree-sitter module structure
 * - Simplify imports for consumers
 * scope:
 * in: loader.ts exports
 * out: Parser, language loading utilities
 */

export {
  initTreeSitter,
  loadLanguage,
  loadTypeScriptWithTsx,
  getGrammarPath,
  getLoadedLanguages,
  isLanguageLoaded,
  clearLanguageCache,
  detectLanguage,
} from "./loader.js";

export type { SupportedLanguage } from "../repograph/types.js";
