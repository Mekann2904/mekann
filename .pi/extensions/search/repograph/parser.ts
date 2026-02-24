/**
 * @abdd.meta
 * path: .pi/extensions/search/repograph/parser.ts
 * role: tree-sitter AST parser for extracting definitions and references
 * why: Replace regex-based call detection with accurate AST-based analysis
 * related: .pi/extensions/search/tree-sitter/loader.ts, .pi/extensions/search/repograph/types.ts
 * public_api: parseFile, walkTree, isDefinition, isCall, extractSymbolName, extractCalleeName
 * invariants:
 * - Line numbers are 1-indexed
 * - Each node has a unique ID
 * - STANDARD_LIBS imports are filtered out
 * side_effects:
 * - May trigger WASM download on first language load
 * failure_modes:
 * - Invalid source code (parser still produces partial tree)
 * - Unsupported language
 * @abdd.explain
 * overview: AST-based code parser using tree-sitter
 * what_it_does:
 * - Parses source files with tree-sitter to extract AST
 * - Identifies function/method/class definitions
 * - Identifies function calls and references
 * - Builds RepoGraph nodes and edges from AST
 * why_it_exists:
 * - Regex-based parsing is inaccurate for complex code
 * - AST provides precise definition/reference extraction
 * - Supports SWE-bench methodology (+32.8% improvement)
 * scope:
 * in: Source code content, file paths, tree-sitter grammars
 * out: RepoGraphNode and RepoGraphEdge arrays
 */

import { Parser, type Node } from "web-tree-sitter";
import { loadLanguage, detectLanguage } from "../tree-sitter/loader.js";
import type {
  RepoGraphNode,
  RepoGraphEdge,
  ParseResult,
  RepoGraphSymbolKind,
  SupportedLanguage,
} from "./types.js";

/**
 * Definition query patterns for each language
 * These are tree-sitter S-expression queries
 */
const DEFINITION_QUERIES: Record<SupportedLanguage, string> = {
  typescript: `
    (function_declaration name: (identifier) @name) @def
    (function_declaration name: (identifier) @name (type_parameters) @tparams) @def
    (method_definition name: (property_identifier) @name) @def
    (class_declaration name: (type_identifier) @name) @def
    (interface_declaration name: (type_identifier) @name) @def
    (type_alias_declaration name: (type_identifier) @name) @def
    (variable_declarator name: (identifier) @name value: (arrow_function)) @def
    (variable_declarator name: (identifier) @name value: (function_expression)) @def
    (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @def
    (import_statement (import_clause (identifier) @name)) @import
    (import_statement (import_clause (named_imports (import_specifier name: (identifier) @name)))) @import
    (export_statement (function_declaration name: (identifier) @name)) @export
  `,
  javascript: `
    (function_declaration name: (identifier) @name) @def
    (method_definition name: (property_identifier) @name) @def
    (class_declaration name: (identifier) @name) @def
    (variable_declarator name: (identifier) @name value: (arrow_function)) @def
    (variable_declarator name: (identifier) @name value: (function_expression)) @def
    (lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @def
    (import_statement (import_clause (identifier) @name)) @import
    (import_statement (import_clause (named_imports (import_specifier name: (identifier) @name)))) @import
    (export_statement (function_declaration name: (identifier) @name)) @export
  `,
  python: `
    (function_definition name: (identifier) @name) @def
    (class_definition name: (identifier) @name) @def
    (import_statement (dotted_name (identifier) @name)) @import
    (import_from_statement (dotted_name (identifier) @name)) @import
    (decorated_definition (function_definition name: (identifier) @name)) @def
  `,
};

/**
 * Reference/call query patterns for each language
 */
const REFERENCE_QUERIES: Record<SupportedLanguage, string> = {
  typescript: `
    (call_expression function: (identifier) @ref)
    (call_expression function: (member_expression property: (property_identifier) @ref))
    (new_expression constructor: (identifier) @ref)
    (new_expression constructor: (member_expression property: (property_identifier) @ref))
  `,
  javascript: `
    (call_expression function: (identifier) @ref)
    (call_expression function: (member_expression property: (property_identifier) @ref))
    (new_expression constructor: (identifier) @ref
  `,
  python: `
    (call_expression function: (identifier) @ref)
    (call_expression function: (attribute attribute: (identifier) @ref))
  `,
};

/**
 * Map tree-sitter node types to RepoGraph symbol kinds
 * @summary Map node type to symbol kind
 * @param nodeType - tree-sitter node type string
 * @returns RepoGraph symbol kind
 */
function mapNodeKind(nodeType: string): RepoGraphSymbolKind {
  const kindMap: Record<string, RepoGraphSymbolKind> = {
    function_declaration: "function",
    method_definition: "method",
    class_declaration: "class",
    interface_declaration: "interface",
    type_alias_declaration: "type",
    variable_declarator: "variable",
    lexical_declaration: "variable",
    import_statement: "import",
    export_statement: "function", // exports are usually functions
    function_definition: "function",
    class_definition: "class",
    decorated_definition: "function",
  };

  return kindMap[nodeType] || "variable";
}

/**
 * Parse a file and extract RepoGraph nodes and edges
 * @summary Parse source file with tree-sitter
 * @param content - Source code content
 * @param filePath - Relative file path
 * @param language - Language to use for parsing
 * @returns Promise resolving to ParseResult with nodes and edges
 * @throws Error if language grammar fails to load
 * @example
 * const { nodes, edges } = await parseFile(code, "src/index.ts", "typescript");
 */
export async function parseFile(
  content: string,
  filePath: string,
  language: SupportedLanguage
): Promise<ParseResult> {
  const lang = await loadLanguage(language);
  const parser = new Parser();
  parser.setLanguage(lang);

  const tree = parser.parse(content);
  if (!tree) {
    return { nodes: [], edges: [] };
  }

  const nodes: RepoGraphNode[] = [];
  const edges: RepoGraphEdge[] = [];
  const lines = content.split("\n");

  // Walk AST and extract definitions/references
  walkTree(tree.rootNode, lines, filePath, nodes, edges, language);

  return { nodes, edges };
}

/**
 * Walk the AST tree and extract nodes
 * @summary Traverse AST and extract definitions/references
 * @param node - Current AST node
 * @param lines - Source code lines
 * @param filePath - File path
 * @param nodes - Accumulated nodes array
 * @param edges - Accumulated edges array
 * @param language - Source language
 */
export function walkTree(
  node: Node,
  lines: string[],
  filePath: string,
  nodes: RepoGraphNode[],
  edges: RepoGraphEdge[],
  language: SupportedLanguage
): void {
  // Extract definitions
  if (isDefinition(node, language)) {
    const symbolName = extractSymbolName(node);
    if (symbolName) {
      const lineNum = node.startPosition.row + 1;
      nodes.push({
        id: `${filePath}:${lineNum}`,
        file: filePath,
        line: lineNum,
        nodeType: "def",
        symbolName,
        symbolKind: mapNodeKind(node.type),
        text: lines[node.startPosition.row] || "",
      });
    }
  }

  // Extract imports
  if (isImport(node, language)) {
    const symbolName = extractSymbolName(node);
    const moduleName = extractModuleName(node, lines[node.startPosition.row]);
    if (symbolName && moduleName && !shouldFilterImport(moduleName)) {
      const lineNum = node.startPosition.row + 1;
      nodes.push({
        id: `${filePath}:${lineNum}:import:${symbolName}`,
        file: filePath,
        line: lineNum,
        nodeType: "import",
        symbolName,
        symbolKind: "import",
        text: lines[node.startPosition.row] || "",
      });
    }
  }

  // Extract calls/references
  if (isCall(node, language)) {
    const calleeName = extractCalleeName(node);
    if (calleeName && !shouldFilterCall(calleeName)) {
      const lineNum = node.startPosition.row + 1;
      const refId = `${filePath}:${lineNum}:ref:${calleeName}`;

      nodes.push({
        id: refId,
        file: filePath,
        line: lineNum,
        nodeType: "ref",
        symbolName: calleeName,
        symbolKind: "function",
        text: lines[node.startPosition.row] || "",
      });

      // Add invoke edge (will be resolved to target definition later)
      edges.push({
        source: `${filePath}:${lineNum}`,
        target: refId,
        type: "invoke",
        confidence: 0.8, // Initial confidence, updated after resolution
      });
    }
  }

  // Recurse into children
  for (const child of node.children) {
    walkTree(child, lines, filePath, nodes, edges, language);
  }
}

/**
 * Check if a node is a definition
 * @summary Check for definition node
 * @param node - AST node
 * @param language - Source language
 * @returns True if node is a definition
 */
export function isDefinition(node: Node, language: SupportedLanguage): boolean {
  const definitionTypes: Record<SupportedLanguage, Set<string>> = {
    typescript: new Set([
      "function_declaration",
      "method_definition",
      "class_declaration",
      "interface_declaration",
      "type_alias_declaration",
    ]),
    javascript: new Set([
      "function_declaration",
      "method_definition",
      "class_declaration",
    ]),
    python: new Set(["function_definition", "class_definition"]),
  };

  // Check for arrow function variable declarations
  if (node.type === "variable_declarator") {
    const value = node.childForFieldName("value");
    return value?.type === "arrow_function" || value?.type === "function_expression";
  }

  return definitionTypes[language]?.has(node.type) ?? false;
}

/**
 * Check if a node is an import statement
 * @summary Check for import node
 * @param node - AST node
 * @param language - Source language
 * @returns True if node is an import
 */
export function isImport(node: Node, language: SupportedLanguage): boolean {
  if (language === "python") {
    return node.type === "import_statement" || node.type === "import_from_statement";
  }
  return node.type === "import_statement";
}

/**
 * Check if a node is a function call
 * @summary Check for call expression
 * @param node - AST node
 * @param language - Source language
 * @returns True if node is a call
 */
export function isCall(node: Node, language: SupportedLanguage): boolean {
  const callTypes: Record<SupportedLanguage, Set<string>> = {
    typescript: new Set(["call_expression", "new_expression"]),
    javascript: new Set(["call_expression", "new_expression"]),
    python: new Set(["call_expression"]),
  };

  return callTypes[language]?.has(node.type) ?? false;
}

/**
 * Extract symbol name from a definition node
 * @summary Extract definition name
 * @param node - AST node
 * @returns Symbol name or undefined
 */
export function extractSymbolName(node: Node): string | undefined {
  // Try 'name' field first (most common)
  const nameNode = node.childForFieldName("name");
  if (nameNode) {
    return nameNode.text;
  }

  // For variable declarators with arrow functions
  if (node.type === "variable_declarator") {
    const name = node.childForFieldName("name");
    return name?.text;
  }

  // For imports, get the first identifier
  if (node.type === "import_statement") {
    const importClause = node.childForFieldName("import_clause");
    if (importClause) {
      // Default import
      const identifier = importClause.descendantsOfType("identifier")[0];
      if (identifier) return identifier.text;

      // Named imports
      const importSpecifiers = importClause.descendantsOfType("import_specifier");
      if (importSpecifiers.length > 0) {
        const name = importSpecifiers[0].childForFieldName("name");
        return name?.text;
      }
    }
  }

  return undefined;
}

/**
 * Extract callee name from a call expression
 * @summary Extract called function name
 * @param node - Call expression node
 * @returns Callee name or undefined
 */
export function extractCalleeName(node: Node): string | undefined {
  const funcNode = node.childForFieldName("function");
  if (!funcNode) return undefined;

  // Direct call: foo()
  if (funcNode.type === "identifier") {
    return funcNode.text;
  }

  // Method call: obj.method() or this.method()
  if (funcNode.type === "member_expression" || funcNode.type === "attribute") {
    const property = funcNode.childForFieldName("property");
    return property?.text;
  }

  return undefined;
}

/**
 * Extract module name from import statement
 * @summary Extract imported module name
 * @param node - Import node
 * @param lineText - Source line text
 * @returns Module name or undefined
 */
export function extractModuleName(node: Node, lineText: string): string | undefined {
  // For tree-sitter, get the source field
  const source = node.childForFieldName("source");
  if (source) {
    // Remove quotes
    return source.text.replace(/['"]/g, "");
  }

  // Fallback to regex from line text
  const match = lineText.match(/from\s+['"]([^'"]+)['"]/);
  return match?.[1];
}

/**
 * Standard library modules to filter from indexing
 */
const FILTERED_MODULES = new Set([
  // Node.js built-ins
  "fs",
  "path",
  "http",
  "https",
  "crypto",
  "os",
  "util",
  "stream",
  "events",
  "buffer",
  "url",
  "querystring",
  "child_process",
  "cluster",
  "dgram",
  "dns",
  "net",
  "readline",
  "repl",
  "tls",
  "tty",
  "v8",
  "vm",
  "zlib",
  "worker_threads",
  "perf_hooks",
  "assert",
  "console",
  "constants",
  "domain",
  "punycode",
  "string_decoder",
  "sys",
  "timers",
  "trace_events",
  // Common external libraries
  "react",
  "react-dom",
  "vue",
  "angular",
  "@angular/core",
  "express",
  "koa",
  "fastify",
  "lodash",
  "underscore",
  "axios",
  "node-fetch",
  "jquery",
  "typescript",
  "tslib",
  // Python standard library
  "sys",
  "json",
  "re",
  "datetime",
  "collections",
  "itertools",
  "functools",
  "typing",
  "asyncio",
  "threading",
  "multiprocessing",
  "subprocess",
  "logging",
  "argparse",
  "pathlib",
  "tempfile",
  "shutil",
  "pickle",
  "sqlite3",
  "hashlib",
  "hmac",
  "secrets",
  "uuid",
  "copy",
  "glob",
  "io",
  "time",
  "random",
  "math",
  "decimal",
  "fractions",
  "statistics",
  "enum",
  "dataclasses",
  "contextlib",
  "abc",
  "traceback",
  "warnings",
  "unittest",
  "pytest",
  "numpy",
  "pandas",
  "scipy",
  "sklearn",
  "tensorflow",
  "torch",
]);

/**
 * Check if import should be filtered out
 * @summary Check import filter status
 * @param moduleName - Module name
 * @returns True if should be filtered
 */
export function shouldFilterImport(moduleName: string): boolean {
  // Check exact match
  if (FILTERED_MODULES.has(moduleName)) {
    return true;
  }

  // Check scoped packages
  if (moduleName.startsWith("@types/")) {
    return true;
  }

  // Check if it's a Node.js built-in (no path separator and not starting with .)
  if (
    !moduleName.includes("/") &&
    !moduleName.startsWith(".") &&
    FILTERED_MODULES.has(moduleName)
  ) {
    return true;
  }

  return false;
}

/**
 * Check if call should be filtered out
 * @summary Check call filter status
 * @param calleeName - Called function name
 * @returns True if should be filtered
 */
export function shouldFilterCall(calleeName: string): boolean {
  // Filter common built-in methods
  const filteredCalls = new Set([
    "console",
    "log",
    "error",
    "warn",
    "info",
    "debug",
    "trace",
    "dir",
    "table",
    "time",
    "timeEnd",
    "assert",
    "JSON",
    "parse",
    "stringify",
    "Object",
    "keys",
    "values",
    "entries",
    "assign",
    "freeze",
    "Array",
    "from",
    "isArray",
    "Promise",
    "resolve",
    "reject",
    "all",
    "race",
    "then",
    "catch",
    "finally",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "addEventListener",
    "removeEventListener",
    "querySelector",
    "querySelectorAll",
    "getElementById",
    "getElementsByClassName",
    "getElementsByTagName",
    "createElement",
    "appendChild",
    "removeChild",
    "innerHTML",
    "textContent",
    "setAttribute",
    "getAttribute",
    "classList",
    "push",
    "pop",
    "shift",
    "unshift",
    "slice",
    "splice",
    "concat",
    "join",
    "indexOf",
    "findIndex",
    "find",
    "filter",
    "map",
    "reduce",
    "forEach",
    "some",
    "every",
    "includes",
    "sort",
    "reverse",
    "flat",
    "flatMap",
    "fill",
    "copyWithin",
    "length",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
  ]);

  return filteredCalls.has(calleeName);
}

/**
 * Parse file with automatic language detection
 * @summary Parse file with auto-detected language
 * @param content - Source code content
 * @param filePath - File path (used for language detection)
 * @returns Promise resolving to ParseResult or null if language unsupported
 */
export async function parseFileAuto(
  content: string,
  filePath: string
): Promise<ParseResult | null> {
  const language = detectLanguage(filePath);
  if (!language) {
    return null;
  }
  return parseFile(content, filePath, language);
}
