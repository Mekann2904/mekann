# context suite

Context-management helpers for mekann Pi extensions.

## output-gate

Stores large tool outputs as redacted plain-text artifacts under `.pi/output-gate/` and returns a short stub to the model. Use `search_tool_outputs` to retrieve snippets from stored artifacts.

- Automatic gating of tool outputs exceeding a size threshold
- `rg`-backed literal search with fallback line scan
- Commands: `/output-gate list|show|stats|purge|clear`
- Manifest metadata: sessionId, turnId, toolCallId, branchId, SHA-256

## context-ledger

Append-only working memory event store for agent session context.

- Records decisions, tasks, errors, plans, file changes, and artifact references
- `search_context_events` tool for retrieval by query, kind, and priority
- Commands: `/context-ledger list|stats|snapshot|clear`
- Snapshot builder generates XML session summaries for compaction/restore
