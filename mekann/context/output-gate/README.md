# output-gate

A lightweight output gate for Pi tool results.

- Large tool outputs are redacted and saved to `.pi/output-gate/artifacts/`.
- `.pi/output-gate/manifest.jsonl` records metadata.
- The LLM receives a compact stub with a preview and artifact id.
- `search_tool_outputs` performs lexical search over stored artifacts.

This module intentionally avoids SQLite, embeddings, MCP, and custom sandbox execution.
