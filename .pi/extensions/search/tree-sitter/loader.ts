/**
 * @abdd.meta
 * path: .pi/extensions/search/tree-sitter/loader.ts
 * role: tree-sitter WASM loader and language grammar manager
 * why: Initialize tree-sitter parser and load language grammars on demand
 * related: .pi/extensions/search/repograph/parser.ts, .pi/extensions/search/tree-sitter/index.ts
 * public_api: initTreeSitter, loadLanguage, getGrammarPath, getLoadedLanguages
 * invariants:
 * - Parser instance is singleton after initialization
 * - Each language grammar is loaded only once
 * - WASM paths are CDN-based for browser compatibility
 * side_effects:
 * - Downloads WASM files from CDN on first load
 * - Caches loaded languages in memory
 * failure_modes:
 * - Network failure when downloading WASM
 * - Invalid language name passed to loadLanguage
 * @abdd.explain
 * overview: tree-sitter initialization and grammar loading utilities
 * what_it_does:
 * - Initializes tree-sitter Parser with WASM runtime
 * - Loads language grammars (TypeScript, JavaScript, Python) from CDN
 * - Caches loaded languages to avoid redundant downloads
 * why_it_exists:
 * - Centralize tree-sitter initialization for the search extension
 * - Support multiple languages with lazy loading
 * scope:
 * in: web-tree-sitter module, CDN URLs
 * out: Parser instances, Language objects
 */

import { Parser, Language } from "web-tree-sitter";
import type { SupportedLanguage } from "../repograph/types.js";

/** Singleton parser instance */
let parserInstance: Parser | null = null;

/** Cache of loaded language grammars */
const loadedLanguages = new Map<string, Language>();

/**
 * Grammar URLs for each supported language
 * Using tree-sitter GitHub releases CDN
 */
const GRAMMAR_URLS: Record<SupportedLanguage, string> = {
  typescript:
    "https://cdn.jsdelivr.net/npm/tree-sitter-typescript@0.23.2/tree-sitter-typescript.wasm",
  javascript:
    "https://cdn.jsdelivr.net/npm/tree-sitter-javascript@0.23.1/tree-sitter-javascript.wasm",
  python:
    "https://cdn.jsdelivr.net/npm/tree-sitter-python@0.23.0/tree-sitter-python.wasm",
};

/**
 * TypeScript grammar requires both typescript and tsx parsers
 */
const TSX_GRAMMAR_URL =
  "https://cdn.jsdelivr.net/npm/tree-sitter-tsx@0.23.2/tree-sitter-tsx.wasm";

/**
 * Initialize tree-sitter parser with WASM runtime
 * @summary Initialize tree-sitter parser
 * @returns Promise resolving to Parser instance
 * @throws Error if WASM initialization fails
 * @example
 * const parser = await initTreeSitter();
 * parser.setLanguage(language);
 */
export async function initTreeSitter(): Promise<Parser> {
  if (parserInstance) {
    return parserInstance;
  }

  await Parser.init();
  parserInstance = new Parser();
  return parserInstance;
}

/**
 * Load a language grammar from WASM
 * @summary Load language grammar
 * @param lang - Language to load (typescript, javascript, python)
 * @returns Promise resolving to Language object
 * @throws Error if grammar download or loading fails
 * @example
 * const tsLang = await loadLanguage("typescript");
 * parser.setLanguage(tsLang);
 */
export async function loadLanguage(lang: SupportedLanguage): Promise<Language> {
  if (loadedLanguages.has(lang)) {
    return loadedLanguages.get(lang)!;
  }

  await initTreeSitter();
  const wasmUrl = getGrammarPath(lang);

  try {
    const language = await Language.load(wasmUrl);
    loadedLanguages.set(lang, language);
    return language;
  } catch (error) {
    throw new Error(
      `Failed to load ${lang} grammar from ${wasmUrl}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load TypeScript with TSX support
 * @summary Load TypeScript grammar with JSX
 * @returns Promise resolving to Language object
 * @throws Error if grammar download or loading fails
 */
export async function loadTypeScriptWithTsx(): Promise<Language> {
  const cacheKey = "typescript-tsx";

  if (loadedLanguages.has(cacheKey)) {
    return loadedLanguages.get(cacheKey)!;
  }

  await initTreeSitter();

  try {
    // Load TSX grammar which includes TypeScript support
    const language = await Language.load(TSX_GRAMMAR_URL);
    loadedLanguages.set(cacheKey, language);
    return language;
  } catch {
    // Fallback to regular TypeScript
    return loadLanguage("typescript");
  }
}

/**
 * Get the WASM URL for a language grammar
 * @summary Get grammar WASM URL
 * @param lang - Language name
 * @returns URL to the WASM grammar file
 */
export function getGrammarPath(lang: SupportedLanguage): string {
  return GRAMMAR_URLS[lang];
}

/**
 * Get list of currently loaded languages
 * @summary Get loaded language names
 * @returns Array of loaded language names
 */
export function getLoadedLanguages(): string[] {
  return Array.from(loadedLanguages.keys());
}

/**
 * Check if a language grammar is loaded
 * @summary Check language loaded status
 * @param lang - Language name
 * @returns True if language is loaded
 */
export function isLanguageLoaded(lang: SupportedLanguage): boolean {
  return loadedLanguages.has(lang);
}

/**
 * Clear all cached languages (useful for testing)
 * @summary Clear language cache
 */
export function clearLanguageCache(): void {
  loadedLanguages.clear();
  parserInstance = null;
}

/**
 * Detect language from file extension
 * @summary Detect language from file path
 * @param filePath - File path or extension
 * @returns Detected language or undefined
 */
export function detectLanguage(filePath: string): SupportedLanguage | undefined {
  const ext = filePath.split(".").pop()?.toLowerCase();

  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "py":
      return "python";
    default:
      return undefined;
  }
}
