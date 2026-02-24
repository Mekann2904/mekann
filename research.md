# Research Report: Search Extension and Embeddings Library

## Executive Summary

The `.pi/extensions/search/` and `.pi/lib/` directories contain a sophisticated code search and analysis system built around three core technologies: **fd/ripgrep** for fast text search, **ctags** for symbol indexing, and **OpenAI embeddings** for semantic search. The architecture follows a modular, tool-based design with fallback implementations for environments without external CLI tools.

---

## 1. Search Tools Implementation Details

### 1.1 file_candidates

**Purpose**: Fast file and directory enumeration

**Implementation**:
- Primary: Wraps `fd` CLI command with argument building
- Fallback: Native Node.js `fs.readdir` recursive scan
- Location: `.pi/extensions/search/tools/file_candidates.ts`

**Data Flow**:
```
Input (pattern, type, extension, exclude, maxDepth, limit)
  → buildFdArgs() → execute("fd", args)
  → parseFdOutput() → truncateResults()
  → Output (FileCandidatesOutput)
```

**Key Features**:
- Glob pattern support (`*.ts`)
- Extension filtering (`['ts', 'tsx']`)
- Exclusion patterns (default: `node_modules`, `dist`, `.git`, etc.)
- Result caching (10 min TTL)
- Search history tracking

### 1.2 code_search

**Purpose**: Regex-based code pattern search

**Implementation**:
- Primary: Wraps `rg` (ripgrep) with JSON output
- Fallback: Native Node.js file scan with regex matching
- Location: `.pi/extensions/search/tools/code_search.ts`

**Data Flow**:
```
Input (pattern, path, type, ignoreCase, literal, context, limit)
  → normalizeCodeSearchInput() → buildRgArgs()
  → execute("rg", args) → parseRgOutput()
  → summarizeResults() → Output (CodeSearchOutput)
```

**Key Features**:
- Regex support with `--json` output
- Context lines (up to 10)
- Literal mode (`--fixed-strings`)
- File type filtering
- Per-file hit summary

### 1.3 sym_index

**Purpose**: Generate symbol definition index using ctags

**Implementation**:
- Uses `universal-ctags` with JSON output format
- Location: `.pi/extensions/search/tools/sym_index.ts`

**Index Structure**:
```
.pi/search/
├── symbols/
│   ├── manifest.json    # { [filePath]: { hash, mtime, shardId } }
│   ├── shard-0.jsonl    # Sharded entries (max 10000 per shard)
│   ├── shard-1.jsonl
│   └── ...
├── symbols.jsonl        # Legacy single-file index
└── meta.json            # Index metadata
```

**Incremental Update Logic**:
1. Compute MD5 hash of file contents
2. Compare with manifest entries
3. Only re-index changed files
4. If >50% files changed, do full re-index

**ctags Arguments**:
```javascript
[
  "--output-format=json",
  "--fields=+n+s+S+k",  // line, signature, scope, kind
  "--extras=+q",         // qualified tags
  "--sort=no",
  "-R", targetPath
]
```

### 1.4 sym_find

**Purpose**: Search symbol definitions from ctags index

**Implementation**:
- Location: `.pi/extensions/search/tools/sym_find.ts`
- Reads from sharded or legacy index

**Filtering Features**:
- `name`: Wildcard pattern matching (`*`, `?`)
- `kind`: Symbol type filter (`function`, `class`, `variable`)
- `file`: File path filter
- `scope`: Scope filter (e.g., class name)

**Detail Levels**:
- `full`: Complete symbol info
- `signature`: Method signatures only
- `outline`: Structure only (name, kind, file, line)

**Sorting**:
- Exact name match priority
- Kind ordering (function > method > class > variable)
- File path alphabetical

---

## 2. Code Analysis: Call Graph

### 2.1 Architecture Overview

**Location**: `.pi/extensions/search/call-graph/`

**Components**:
- `builder.ts`: Graph construction from symbol index
- `query.ts`: Graph traversal and search
- `types.ts`: Type definitions

### 2.2 Graph Building Process

**Phase 1: Regex-based Call Detection** (current implementation)

```
1. Get function definitions from sym_index
2. For each function:
   a. Extract body (line range estimation)
   b. Find all identifier( patterns via ripgrep
   c. Filter against known function names
   d. Calculate confidence score
3. Build nodes and edges
4. Persist to .pi/search/call-graph/index.json
```

**Confidence Scoring**:
```javascript
BASE_CONFIDENCE = 0.8
SAME_FILE_BONUS = 1.0
COMMON_NAME_PENALTY = 0.7  // for names like "get", "set", "init"
EXTERNAL_PENALTY = 0.5     // function not in symbol index
```

### 2.3 Graph Structure

```typescript
interface CallGraphIndex {
  nodes: CallGraphNode[];    // Function definitions
  edges: CallGraphEdge[];    // Call relationships
  metadata: {
    indexedAt: number;
    parserBackend: "ripgrep";
    fileCount: number;
    nodeCount: number;
    edgeCount: number;
    version: number;
  };
}
```

### 2.4 Query Functions

- `findNodesByName()`: Lookup by symbol name
- `findNodeById()`: Lookup by unique ID
- `findNodesByFile()`: All functions in a file
- `findCallers()`: Who calls this function? (with depth traversal)
- `findCallees()`: What does this function call? (with depth traversal)
- `findCallPath()`: Path between two symbols

---

## 3. Semantic Search

### 3.1 Architecture

**Index Generation**: `.pi/extensions/search/tools/semantic_index.ts`
**Search Execution**: `.pi/extensions/search/tools/semantic_search.ts`
**Embeddings Library**: `.pi/lib/embeddings/`

### 3.2 Embeddings Module Structure

```
.pi/lib/embeddings/
├── index.ts           # Public API barrel file
├── types.ts           # Type definitions
├── registry.ts        # Provider registry
├── utils.ts           # Vector operations
└── providers/
    ├── openai.ts      # OpenAI text-embedding-3-small
    └── local.ts       # Local fallback (placeholder)
```

### 3.3 Provider System

**OpenAI Provider**:
- Model: `text-embedding-3-small`
- Dimensions: 1536
- Max tokens: 8191
- Batch support: Yes (max 2048)

**API Key Resolution**:
1. `~/.pi/agent/auth.json`: `{ "openai": { "type": "api_key", "key": "sk-..." } }`
2. Environment variable: `OPENAI_API_KEY`

**Registry Pattern**:
```typescript
embeddingRegistry.register(openAIEmbeddingProvider);
embeddingRegistry.register(createLocalEmbeddingProvider());

const provider = await embeddingRegistry.getDefault();
const embedding = await provider.generateEmbedding(text);
```

### 3.4 Indexing Process

```
1. Collect files (recursive scan, extension filter)
2. Chunk code:
   - Default chunk size: 500 chars
   - Overlap: 50 chars
   - Line-based splitting
3. Generate embeddings for each chunk
4. Store as JSONL:
   - id (MD5 hash)
   - file, line, code
   - embedding (number[])
   - metadata (language, symbol, kind, dimensions, model)
```

### 3.5 Search Process

```
1. Generate embedding for query
2. Load index from disk
3. Filter by language/kind if specified
4. Calculate cosine similarity with all entries
5. Filter by threshold (default 0.5)
6. Sort by similarity, return topK (default 10)
```

### 3.6 Vector Utilities

Location: `.pi/lib/embeddings/utils.ts`

**Functions**:
- `cosineSimilarity(a, b)`: Dot product / (normA * normB)
- `euclideanDistance(a, b)`: L2 distance
- `normalizeVector(v)`: L2 normalization
- `findNearestNeighbors()`: Top-k search
- `findBySimilarityThreshold()`: Filter by threshold

---

## 4. Extension Architecture

### 4.1 Tool Registration Pattern

```typescript
// .pi/extensions/search/index.ts
export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "file_candidates",
    label: "File Candidates",
    description: "...",
    parameters: Type.Object({...}),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx?.cwd ?? process.cwd();
      const result = await fileCandidates(params, cwd);
      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: result,
      };
    },
  });
}
```

### 4.2 Shared Utilities

**CLI Execution** (`.pi/extensions/search/utils/cli.ts`):
```typescript
execute(command, args, {
  cwd,
  timeout: 30000,
  signal: AbortSignal,
  maxOutputSize: 10 * 1024 * 1024,
  env: {}
})
```

**Caching** (`.pi/extensions/search/utils/cache.ts`):
- In-memory LRU cache
- TTL-based expiration
- Key generation from params

**History** (`.pi/extensions/search/utils/history.ts`):
- Records tool invocations
- Query extraction
- Result paths tracking

### 4.3 Error Handling

**Error Types** (`.pi/extensions/search/utils/errors.ts`):
- `parameterError`: Invalid input
- `dependencyError`: Missing tool (ctags, fd, rg)
- `executionError`: Command failed
- `indexError`: Index issues

### 4.4 Adding New Tools

1. Create tool file in `tools/`
2. Implement main function with Input/Output types
3. Add format function for output
4. Register in `index.ts` with `pi.registerTool()`
5. Export tool definition

---

## 5. Parallel Search Support

**Location**: `.pi/lib/parallel-search.ts`

**Purpose**: Execute multiple searches concurrently and merge results

**Key Functions**:
- `parallelSearch(queries, searchFn, config)`: Same tool, multiple queries
- `parallelMultiToolSearch(searchFns, config)`: Different tools in parallel

**Features**:
- Timeout handling (default 30s)
- Result deduplication by `path:line`
- Context budget enforcement
- Score-based sorting
- Error tolerance (partial failures allowed)

---

## 6. Data Structures Summary

### 6.1 Symbol Index Entry

```typescript
interface SymbolIndexEntry {
  name: string;        // Symbol name
  kind: string;        // function, class, variable, etc.
  file: string;        // Relative path
  line: number;        // 1-indexed line number
  signature?: string;  // Function signature
  scope?: string;      // Containing class/namespace
  pattern?: string;    // ctags pattern
}
```

### 6.2 Code Embedding

```typescript
interface CodeEmbedding {
  id: string;          // MD5 hash
  file: string;        // Relative path
  line: number;        // Start line
  code: string;        // Code content
  embedding: number[]; // Vector (1536 dims for OpenAI)
  metadata: {
    language: string;
    symbol?: string;
    kind?: "function" | "class" | "variable" | "chunk";
    dimensions: number;
    model: string;
    tokens?: number;
  };
}
```

### 6.3 Call Graph Node/Edge

```typescript
interface CallGraphNode {
  id: string;          // file:line:name
  name: string;        // Function name
  file: string;        // Source file
  line: number;        // Definition line
  kind: "function" | "method" | "arrow" | "const";
  scope?: string;      // Containing class
}

interface CallGraphEdge {
  caller: string;      // Caller node ID
  callee: string;      // Callee function name
  callSite: {
    file: string;
    line: number;
    column: number;
  };
  confidence: number;  // 0.0 - 1.0
}
```

---

## 7. File Locations Reference

| Component | Path |
|-----------|------|
| Search Extension Entry | `.pi/extensions/search/index.ts` |
| Type Definitions | `.pi/extensions/search/types.ts` |
| Tool Implementations | `.pi/extensions/search/tools/*.ts` |
| Call Graph Module | `.pi/extensions/search/call-graph/*.ts` |
| Utilities | `.pi/extensions/search/utils/*.ts` |
| Embeddings Library | `.pi/lib/embeddings/*.ts` |
| Parallel Search | `.pi/lib/parallel-search.ts` |
| Symbol Index Storage | `.pi/search/symbols/` |
| Call Graph Storage | `.pi/search/call-graph/` |
| Semantic Index Storage | `.pi/search/semantic-index.jsonl` |

---

## 8. Key Insights

### Strengths
1. **Graceful Fallbacks**: All tools work without external CLI dependencies
2. **Incremental Updates**: Symbol index uses content hashing for efficient re-indexing
3. **Modular Design**: Clean separation between tools, utilities, and storage
4. **Context Awareness**: Token estimation and budget management
5. **Multi-layered Search**: Text → Symbol → Call Graph → Semantic

### Limitations
1. **Call Graph Accuracy**: Regex-based detection has false positives (acknowledged as "Phase 1")
2. **No AST Parsing**: tree-sitter integration not yet implemented
3. **External Dependencies**: Semantic search requires OpenAI API key
4. **Single Embedding Model**: Only text-embedding-3-small supported

### Recommended Improvements
1. Integrate tree-sitter for accurate AST-based call graph
2. Add local embedding provider (e.g., Transformers.js)
3. Implement cross-file type inference for better call resolution
4. Add support for more embedding models (Cohere, Voyage, etc.)
