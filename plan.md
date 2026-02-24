# Implementation Plan: RepoGraph Integration

## Purpose

Integrate RepoGraph methodology (SWE-bench +32.8% improvement) into the search extension, replacing regex-based call graph with AST-based analysis using tree-sitter.

## Overview

| Priority | Component | Impact | Rounds |
|----------|-----------|--------|--------|
| P1 | tree-sitter integration | High | 8-12 |
| P2 | RepoGraph module | High | 10-15 |
| P3 | Egograph search tool | Medium | 5-8 |
| P4 | Framework integration | Medium | 3-5 |

**Total Estimated Rounds**: 26-40

---

## Priority 1: tree-sitter Integration

### Goal

Replace regex-based call detection with AST-based analysis for accurate definition/reference extraction.

### Dependencies

```json
{
  "web-tree-sitter": "^0.26.5"
}
```

### Data Structures

```typescript
// .pi/extensions/search/repograph/types.ts

/** Line-level node in RepoGraph */
export interface RepoGraphNode {
  id: string;              // file:line
  file: string;
  line: number;
  nodeType: "def" | "ref" | "import" | "export";
  symbolName: string;
  symbolKind: "function" | "method" | "class" | "variable" | "import";
  scope?: string;
  text: string;            // Source line content
}

/** Edge types in RepoGraph */
export type RepoGraphEdgeType = 
  | "invoke"    // A calls B
  | "contain"   // A contains B (file contains function)
  | "define"    // A defines B (import defines symbol)
  | "reference" // A references B
  | "next";     // Sequential line relationship

export interface RepoGraphEdge {
  source: string;          // Source node ID
  target: string;          // Target node ID
  type: RepoGraphEdgeType;
  confidence: number;
}

export interface RepoGraphIndex {
  nodes: Map<string, RepoGraphNode>;
  edges: RepoGraphEdge[];
  metadata: {
    indexedAt: number;
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    language: string;
    version: number;
  };
}
```

### File Structure

```
.pi/extensions/search/
├── repograph/
│   ├── types.ts           # Type definitions
│   ├── parser.ts          # tree-sitter AST parser
│   ├── builder.ts         # Graph construction
│   ├── query.ts           # Graph queries
│   ├── egograph.ts        # k-hop subgraph extraction
│   └── index.ts           # Public API
├── tree-sitter/
│   ├── loader.ts          # WASM loader for grammars
│   ├── grammars/          # Language grammar registry
│   │   ├── typescript.ts
│   │   ├── javascript.ts
│   │   └── python.ts
│   └── index.ts
```

### Implementation Steps

#### Step 1.1: tree-sitter Loader (2-3 rounds)

```typescript
// .pi/extensions/search/tree-sitter/loader.ts

import Parser from "web-tree-sitter";

let parserInstance: Parser | null = null;
const loadedLanguages = new Map<string, Parser.Language>();

/**
 * Initialize tree-sitter parser with WASM
 */
export async function initTreeSitter(): Promise<Parser> {
  if (parserInstance) return parserInstance;
  
  await Parser.init();
  parserInstance = new Parser();
  return parserInstance;
}

/**
 * Load language grammar from WASM
 */
export async function loadLanguage(
  lang: "typescript" | "javascript" | "python"
): Promise<Parser.Language> {
  if (loadedLanguages.has(lang)) {
    return loadedLanguages.get(lang)!;
  }
  
  const parser = await initTreeSitter();
  const wasmPath = getGrammarPath(lang);
  
  const language = await Parser.Language.load(wasmPath);
  parser.setLanguage(language);
  
  loadedLanguages.set(lang, language);
  return language;
}

function getGrammarPath(lang: string): string {
  // Grammars bundled with extension or downloaded on-demand
  const grammarUrls: Record<string, string> = {
    typescript: "https://cdn.example.com/tree-sitter-typescript.wasm",
    javascript: "https://cdn.example.com/tree-sitter-javascript.wasm",
    python: "https://cdn.example.com/tree-sitter-python.wasm",
  };
  return grammarUrls[lang];
}
```

#### Step 1.2: AST Parser (3-4 rounds)

```typescript
// .pi/extensions/search/repograph/parser.ts

import Parser from "web-tree-sitter";
import { loadLanguage } from "../tree-sitter/loader.js";
import type { RepoGraphNode, RepoGraphEdge } from "./types.js";

interface ParseResult {
  nodes: RepoGraphNode[];
  edges: RepoGraphEdge[];
}

/**
 * Parse file with tree-sitter and extract def/ref nodes
 */
export async function parseFile(
  content: string,
  filePath: string,
  language: string
): Promise<ParseResult> {
  const lang = await loadLanguage(language as "typescript" | "javascript" | "python");
  const parser = new Parser();
  parser.setLanguage(lang);
  
  const tree = parser.parse(content);
  const nodes: RepoGraphNode[] = [];
  const edges: RepoGraphEdge[] = [];
  
  // Walk AST and extract definitions/references
  walkTree(tree.rootNode, content, filePath, nodes, edges);
  
  return { nodes, edges };
}

/**
 * Query types for tree-sitter queries
 */
const DEFINITION_QUERIES: Record<string, string> = {
  typescript: `
    (function_declaration name: (identifier) @name) @def
    (method_definition name: (property_identifier) @name) @def
    (class_declaration name: (type_identifier) @name) @def
    (variable_declarator name: (identifier) @name value: (arrow_function)) @def
    (import_statement (import_clause (identifier) @name)) @import
  `,
  python: `
    (function_definition name: (identifier) @name) @def
    (class_definition name: (identifier) @name) @def
    (import_statement (dotted_name (identifier) @name)) @import
  `,
};

const REFERENCE_QUERIES: Record<string, string> = `
  (call_expression function: (identifier) @ref)
  (call_expression function: (member_expression property: (property_identifier) @ref))
`;

function walkTree(
  node: Parser.SyntaxNode,
  content: string,
  filePath: string,
  nodes: RepoGraphNode[],
  edges: RepoGraphEdge[]
): void {
  // Extract definitions
  if (isDefinition(node)) {
    const symbolName = extractSymbolName(node);
    nodes.push({
      id: `${filePath}:${node.startPosition.row + 1}`,
      file: filePath,
      line: node.startPosition.row + 1,
      nodeType: "def",
      symbolName,
      symbolKind: mapNodeKind(node.type),
      text: content.split("\n")[node.startPosition.row],
    });
  }
  
  // Extract references (calls)
  if (isCall(node)) {
    const calleeName = extractCalleeName(node);
    nodes.push({
      id: `${filePath}:${node.startPosition.row + 1}:ref:${calleeName}`,
      file: filePath,
      line: node.startPosition.row + 1,
      nodeType: "ref",
      symbolName: calleeName,
      symbolKind: "function",
      text: content.split("\n")[node.startPosition.row],
    });
  }
  
  // Recurse into children
  for (const child of node.children) {
    walkTree(child, content, filePath, nodes, edges);
  }
}
```

#### Step 1.3: Replace call_graph builder (2-3 rounds)

```typescript
// .pi/extensions/search/call-graph/builder.ts (modified)

import { parseFile } from "../repograph/parser.js";

/**
 * Build call graph using tree-sitter (Phase 2)
 */
export async function buildCallGraphAST(
  path: string,
  cwd: string
): Promise<CallGraphIndex> {
  // Get all source files
  const files = await getSourceFiles(path, cwd);
  
  const allNodes: CallGraphNode[] = [];
  const allEdges: CallGraphEdge[] = [];
  
  for (const file of files) {
    const content = await readFile(join(cwd, file), "utf-8");
    const language = detectLanguage(file);
    
    const { nodes, edges } = await parseFile(content, file, language);
    
    // Convert RepoGraph nodes to CallGraphNodes
    for (const node of nodes.filter(n => n.nodeType === "def")) {
      allNodes.push({
        id: node.id,
        name: node.symbolName,
        file: node.file,
        line: node.line,
        kind: mapSymbolKind(node.symbolKind),
        scope: node.scope,
      });
    }
    
    // Convert edges
    for (const edge of edges.filter(e => e.type === "invoke")) {
      allEdges.push({
        caller: edge.source,
        callee: edge.target,
        callSite: extractCallSite(edge),
        confidence: 1.0, // AST-based has full confidence
      });
    }
  }
  
  return {
    nodes: allNodes,
    edges: allEdges,
    metadata: {
      indexedAt: Date.now(),
      parserBackend: "tree-sitter",
      fileCount: files.length,
      nodeCount: allNodes.length,
      edgeCount: allEdges.length,
      version: 2,
    },
  };
}
```

### Tests

```typescript
// .pi/extensions/search/repograph/parser.test.ts

describe("RepoGraph Parser", () => {
  it("extracts function definitions", async () => {
    const code = `
      function foo() { return 1; }
      const bar = () => 2;
    `;
    const { nodes } = await parseFile(code, "test.ts", "typescript");
    
    expect(nodes.filter(n => n.nodeType === "def")).toHaveLength(2);
    expect(nodes.find(n => n.symbolName === "foo")).toBeDefined();
    expect(nodes.find(n => n.symbolName === "bar")).toBeDefined();
  });
  
  it("extracts function calls", async () => {
    const code = `
      function foo() { bar(); }
      function bar() {}
    `;
    const { nodes, edges } = await parseFile(code, "test.ts", "typescript");
    
    const ref = nodes.find(n => n.symbolName === "bar" && n.nodeType === "ref");
    expect(ref).toBeDefined();
  });
  
  it("filters standard library imports", async () => {
    const code = `
      import { readFile } from 'fs';
      import { parse } from './local';
    `;
    const { nodes } = await parseFile(code, "test.ts", "typescript");
    
    // fs imports should be filtered out
    const fsImport = nodes.find(n => n.symbolName === "readFile");
    expect(fsImport).toBeUndefined();
    
    // local imports should be kept
    const localImport = nodes.find(n => n.symbolName === "parse");
    expect(localImport).toBeDefined();
  });
});
```

---

## Priority 2: RepoGraph Module

### Goal

Build line-level dependency graph with def/ref nodes and invoke/contain edges.

### Implementation Steps

#### Step 2.1: Graph Builder (4-5 rounds)

```typescript
// .pi/extensions/search/repograph/builder.ts

import { parseFile } from "./parser.js";
import type { RepoGraphIndex, RepoGraphNode, RepoGraphEdge } from "./types.js";

const STANDARD_LIBS = new Set([
  "fs", "path", "http", "https", "crypto", "os", "util", "stream",
  "events", "buffer", "url", "querystring", "child_process",
  "react", "vue", "angular", "express", "lodash", "axios",
  // Python
  "os", "sys", "json", "re", "datetime", "collections", "itertools",
]);

/**
 * Build RepoGraph from project files
 */
export async function buildRepoGraph(
  path: string,
  cwd: string
): Promise<RepoGraphIndex> {
  const files = await getSourceFiles(path, cwd);
  const nodes = new Map<string, RepoGraphNode>();
  const edges: RepoGraphEdge[] = [];
  
  // Phase 1: Parse all files
  for (const file of files) {
    const content = await readFile(join(cwd, file), "utf-8");
    const language = detectLanguage(file);
    const lines = content.split("\n");
    
    const { nodes: fileNodes, edges: fileEdges } = await parseFile(content, file, language);
    
    // Add filtered nodes
    for (const node of fileNodes) {
      if (shouldIncludeNode(node)) {
        nodes.set(node.id, node);
      }
    }
    
    edges.push(...fileEdges.filter(shouldIncludeEdge));
    
    // Add "contain" edges (file -> definitions)
    for (const defNode of fileNodes.filter(n => n.nodeType === "def")) {
      edges.push({
        source: file,
        target: defNode.id,
        type: "contain",
        confidence: 1.0,
      });
    }
    
    // Add "next" edges (sequential lines)
    for (let i = 0; i < lines.length - 1; i++) {
      edges.push({
        source: `${file}:${i + 1}`,
        target: `${file}:${i + 2}`,
        type: "next",
        confidence: 0.5,
      });
    }
  }
  
  // Phase 2: Resolve references to definitions
  resolveReferences(nodes, edges);
  
  return {
    nodes,
    edges,
    metadata: {
      indexedAt: Date.now(),
      fileCount: files.length,
      nodeCount: nodes.size,
      edgeCount: edges.length,
      language: "multi",
      version: 1,
    },
  };
}

function shouldIncludeNode(node: RepoGraphNode): boolean {
  // Filter out standard library references
  if (node.nodeType === "import") {
    const moduleName = extractModuleName(node.text);
    if (STANDARD_LIBS.has(moduleName)) {
      return false;
    }
  }
  return true;
}

function resolveReferences(
  nodes: Map<string, RepoGraphNode>,
  edges: RepoGraphEdge[]
): void {
  // Build symbol -> definition map
  const definitions = new Map<string, RepoGraphNode>();
  for (const node of nodes.values()) {
    if (node.nodeType === "def") {
      definitions.set(node.symbolName, node);
    }
  }
  
  // Resolve refs to defs
  for (const edge of edges) {
    if (edge.type === "invoke") {
      const refNode = nodes.get(edge.source);
      if (refNode && refNode.nodeType === "ref") {
        const defNode = definitions.get(refNode.symbolName);
        if (defNode) {
          edge.target = defNode.id;
          edge.confidence = 1.0;
        }
      }
    }
  }
}
```

#### Step 2.2: Index Persistence (2-3 rounds)

```typescript
// .pi/extensions/search/repograph/storage.ts

const REPOGRAPH_DIR = ".pi/search/repograph";
const INDEX_FILE = "index.json";

export async function saveRepoGraph(
  graph: RepoGraphIndex,
  cwd: string
): Promise<string> {
  const indexPath = join(cwd, REPOGRAPH_DIR, INDEX_FILE);
  await mkdir(dirname(indexPath), { recursive: true });
  
  // Convert Map to array for JSON serialization
  const serializable = {
    nodes: Array.from(graph.nodes.entries()),
    edges: graph.edges,
    metadata: graph.metadata,
  };
  
  await writeFile(indexPath, JSON.stringify(serializable), "utf-8");
  return indexPath;
}

export async function loadRepoGraph(cwd: string): Promise<RepoGraphIndex | null> {
  const indexPath = join(cwd, REPOGRAPH_DIR, INDEX_FILE);
  
  try {
    const content = await readFile(indexPath, "utf-8");
    const data = JSON.parse(content);
    
    return {
      nodes: new Map(data.nodes),
      edges: data.edges,
      metadata: data.metadata,
    };
  } catch {
    return null;
  }
}
```

---

## Priority 3: Egograph Search Tool

### Goal

Implement k-hop subgraph extraction for localization.

### Implementation

```typescript
// .pi/extensions/search/repograph/egograph.ts

import type { RepoGraphIndex, RepoGraphNode, RepoGraphEdge } from "./types.js";

export interface EgographOptions {
  keywords: string[];
  k: number;           // Number of hops (default: 2)
  maxNodes: number;    // Max nodes in result (default: 100)
  flatten: boolean;    // Return flat list vs nested graph
  summarize: boolean;  // Include LLM-ready summary
}

export interface EgographResult {
  nodes: RepoGraphNode[];
  edges: RepoGraphEdge[];
  rootNodes: string[];
  summary?: string;
}

/**
 * Extract k-hop egograph around keywords
 */
export function extractEgograph(
  graph: RepoGraphIndex,
  options: EgographOptions
): EgographResult {
  const { keywords, k, maxNodes, flatten } = options;
  
  // Step 1: Find seed nodes matching keywords
  const seedNodes = findSeedNodes(graph, keywords);
  
  // Step 2: Expand k hops
  const visited = new Set<string>();
  const resultNodes: RepoGraphNode[] = [];
  const resultEdges: RepoGraphEdge[] = [];
  
  const queue: Array<{ nodeId: string; depth: number }> = 
    seedNodes.map(id => ({ nodeId: id, depth: 0 }));
  
  while (queue.length > 0 && resultNodes.length < maxNodes) {
    const { nodeId, depth } = queue.shift()!;
    
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    
    const node = graph.nodes.get(nodeId);
    if (node) {
      resultNodes.push(node);
    }
    
    if (depth < k) {
      // Add neighbors
      for (const edge of graph.edges) {
        if (edge.source === nodeId && !visited.has(edge.target)) {
          resultEdges.push(edge);
          queue.push({ nodeId: edge.target, depth: depth + 1 });
        }
        if (edge.target === nodeId && !visited.has(edge.source)) {
          resultEdges.push(edge);
          queue.push({ nodeId: edge.source, depth: depth + 1 });
        }
      }
    }
  }
  
  return {
    nodes: resultNodes,
    edges: resultEdges,
    rootNodes: seedNodes,
    summary: options.summarize ? summarizeGraph(resultNodes, resultEdges) : undefined,
  };
}

function findSeedNodes(graph: RepoGraphIndex, keywords: string[]): string[] {
  const seeds: string[] = [];
  
  for (const [id, node] of graph.nodes) {
    for (const keyword of keywords) {
      if (
        node.symbolName.toLowerCase().includes(keyword.toLowerCase()) ||
        node.text.toLowerCase().includes(keyword.toLowerCase())
      ) {
        seeds.push(id);
        break;
      }
    }
  }
  
  return seeds;
}

function summarizeGraph(nodes: RepoGraphNode[], edges: RepoGraphEdge[]): string {
  const defs = nodes.filter(n => n.nodeType === "def");
  const refs = nodes.filter(n => n.nodeType === "ref");
  
  return `Found ${defs.length} definitions and ${refs.length} references. ` +
    `Key symbols: ${defs.map(d => d.symbolName).slice(0, 10).join(", ")}`;
}
```

### Tool Registration

```typescript
// In .pi/extensions/search/index.ts

pi.registerTool({
  name: "search_repograph",
  label: "Search RepoGraph",
  description: "Extract k-hop subgraph around keywords from the RepoGraph index. Useful for code localization.",
  parameters: Type.Object({
    keywords: Type.Array(Type.String(), { description: "Keywords to search" }),
    k: Type.Optional(Type.Number({ description: "Number of hops (default: 2)" })),
    maxNodes: Type.Optional(Type.Number({ description: "Max nodes (default: 100)" })),
    flatten: Type.Optional(Type.Boolean({ description: "Return flat list" })),
    summarize: Type.Optional(Type.Boolean({ description: "Include summary" })),
  }),
  
  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    const cwd = ctx?.cwd ?? process.cwd();
    const graph = await loadRepoGraph(cwd);
    
    if (!graph) {
      return {
        content: [{ type: "text", text: "Error: RepoGraph index not found. Run repograph_index first." }],
        details: { error: "index_not_found" },
      };
    }
    
    const result = extractEgograph(graph, {
      keywords: params.keywords,
      k: params.k ?? 2,
      maxNodes: params.maxNodes ?? 100,
      flatten: params.flatten ?? false,
      summarize: params.summarize ?? true,
    });
    
    return {
      content: [{ type: "text", text: formatEgograph(result) }],
      details: result,
    };
  },
});
```

---

## Priority 4: Framework Integration

### Goal

Integrate RepoGraph into subagents and agent teams for improved localization.

### Implementation

```typescript
// .pi/extensions/repograph-localization/index.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadRepoGraph, extractEgograph } from "../search/repograph/index.js";

export default function (pi: ExtensionAPI) {
  // Register as a skill that subagents can use
  pi.registerSkill({
    name: "repograph-localization",
    description: "Use RepoGraph for code localization",
    
    async localize(task: string, cwd: string): Promise<string[]> {
      // Extract keywords from task
      const keywords = extractKeywords(task);
      
      const graph = await loadRepoGraph(cwd);
      if (!graph) return [];
      
      const egograph = extractEgograph(graph, {
        keywords,
        k: 2,
        maxNodes: 50,
        flatten: true,
        summarize: true,
      });
      
      // Return relevant file:line locations
      return egograph.nodes.map(n => `${n.file}:${n.line}`);
    },
  });
  
  // Hook into subagent context enrichment
  pi.on("subagent:before_task", async (event, ctx) => {
    const { task, cwd } = event;
    const graph = await loadRepoGraph(cwd);
    
    if (graph) {
      const keywords = extractKeywords(task);
      const egograph = extractEgograph(graph, {
        keywords,
        k: 2,
        maxNodes: 30,
        flatten: true,
        summarize: false,
      });
      
      // Add to subagent context
      event.context = event.context || {};
      event.context.repographContext = egograph.nodes
        .map(n => `${n.file}:${n.line} [${n.nodeType}] ${n.symbolName}`)
        .join("\n");
    }
  });
}
```

---

## Todo

### Priority 1: tree-sitter Integration
- [x] Add web-tree-sitter dependency
- [x] Create tree-sitter loader module
- [x] Implement TypeScript/JavaScript grammar loading
- [x] Implement Python grammar loading
- [x] Create AST parser with def/ref extraction
- [x] Add standard library filtering
- [ ] Replace call_graph builder with AST version (optional, Phase 2)
- [ ] Write parser tests

### Priority 2: RepoGraph Module
- [x] Define RepoGraph types
- [x] Implement graph builder
- [x] Add reference resolution
- [x] Implement index persistence
- [x] Add incremental update support
- [ ] Write builder tests
- [x] Register repograph_index tool
- [x] Register repograph_query tool

### Priority 3: Egograph Search
- [x] Implement k-hop extraction
- [x] Add keyword matching
- [x] Implement graph summarization
- [x] Create search_repograph tool (registered as repograph_query)
- [ ] Write egograph tests

### Priority 4: Framework Integration
- [ ] Create repograph-localization extension
- [ ] Implement task keyword extraction
- [ ] Add subagent context enrichment
- [ ] Integrate with agent teams
- [ ] Write integration tests

---

## Estimation

| Phase | Description | Rounds |
|-------|-------------|--------|
| P1.1 | tree-sitter loader | 2-3 |
| P1.2 | AST parser | 3-4 |
| P1.3 | Replace call_graph | 2-3 |
| P2.1 | Graph builder | 4-5 |
| P2.2 | Index persistence | 2-3 |
| P3.1 | Egograph extraction | 3-4 |
| P3.2 | Tool registration | 2-3 |
| P4.1 | Framework integration | 3-5 |
| **Total** | | **21-30** |

Risk buffer (+20%): 4-6 rounds

**Final Estimate**: 25-36 tool call rounds

---

## Considerations

1. **WASM Loading**: tree-sitter grammars are WASM files (~1-2MB each). Need download caching strategy.

2. **Language Support**: Start with TypeScript/JavaScript, expand to Python. Other languages require additional grammars.

3. **Performance**: Large repos (>10k files) may need incremental indexing similar to sym_index.

4. **Backward Compatibility**: Keep existing call_graph tools working during transition.

5. **Testing**: Need sample projects for each language to test parsing accuracy.

6. **Memory**: RepoGraph with line-level nodes can be large. Consider node aggregation for files >1000 lines.
