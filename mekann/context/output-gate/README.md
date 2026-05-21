# output-gate

A lightweight output gate for Pi tool results.

- Large tool outputs are redacted and saved to `.pi/output-gate/artifacts/`.
- `.pi/output-gate/manifest.jsonl` records metadata (schema version, session/turn/tool-call IDs, SHA-256, etc.).
- The LLM receives a compact stub with a preview and artifact id.
- `search_tool_outputs` performs rg-backed literal search over stored artifacts (fallback to line scan if rg unavailable).

## Commands

| Command | Description |
|---------|-------------|
| `/output-gate` | Show status (artifact count, total bytes) |
| `/output-gate list` | List recent artifacts (newest 20) |
| `/output-gate show <id>` | Show artifact metadata |
| `/output-gate stats` | Aggregate stats (counts, bytes, lines, tool breakdown) |
| `/output-gate purge [--keep N]` | Remove oldest artifacts, keep N most recent (default: 200 from config) |
| `/output-gate clear` | Delete all artifacts (with confirmation) |

## Search

`search_tool_outputs` parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | (required) | Search string |
| `artifact` | (all) | Restrict to a specific artifact id |
| `preferRg` | `true` | Use ripgrep when available |
| `literal` | `true` | Treat query as fixed string (not regex) |
| `caseSensitive` | `false` | Case-sensitive matching |
| `maxResults` | 10 | Maximum matching snippets |
| `contextLines` | 3 | Context lines around each match |

## Design

This module intentionally avoids SQLite, embeddings, MCP, and custom sandbox execution.
All storage is plain text files + JSONL manifest, searchable via `rg` or built-in fallback.
