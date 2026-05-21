# context-ledger

Append-only context event store for Pi agent working memory.

output-gate stores **large tool outputs**. context-ledger stores **decisions, tasks, errors, and references** — the information an agent needs to maintain coherent behavior across long sessions.

## Storage

- `.pi/mekann-context/events.jsonl` — one JSON object per line
- Append-only: events are never mutated in place
- Each event carries `schemaVersion: "mekann-context/v1"`

## Schema

```ts
interface MekannContextEvent {
  schemaVersion: "mekann-context/v1";
  id: string;              // ctx_<base36>_<base36>
  kind: "tool_result" | "user_decision" | "file_change" |
        "error" | "task" | "plan" | "subagent";
  createdAt: number;
  cwd: string;
  sessionId?: string;
  turnId?: string;
  toolCallId?: string;
  branchId?: string;
  priority: 0 | 1 | 2 | 3 | 4;  // 0=critical, 4=info
  title: string;
  summary: string;
  refs?: Array<{
    type: "artifact" | "file" | "url" | "symbol" | "commit";
    value: string;
  }>;
}
```

## Tool

`search_context_events` — search decisions, tasks, errors, plans, and artifact references.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | (none) | Search title, summary, and ref values |
| `kind` | (all) | Filter by event kind |
| `priorityMax` | (all) | Only events with priority ≤ this (0–4) |
| `maxResults` | 20 | Maximum events to return (1–100) |

Use `search_context_events` for decisions, tasks, errors, and plans.
Use `search_tool_outputs` for raw log/output snippets stored by output-gate.

`summarize_session_context` — read or rebuild a compact session snapshot for working memory restore.

| Parameter | Default | Description |
|-----------|---------|-------------|
| `rebuild` | `false` | Rebuild from context events instead of reading latest snapshot |
| `maxBytes` | 4096 | Maximum snapshot bytes (256–65536) |

## Commands

| Command | Description |
|---------|-------------|
| `/context-ledger` | Show status |
| `/context-ledger list` | List recent events (newest 20) |
| `/context-ledger stats` | Aggregate stats by kind and priority |
| `/context-ledger snapshot` | Build XML session snapshot from events |
| `/context-ledger snapshot --max-bytes N` | Build snapshot with byte budget (min 256) |
| `/context-ledger snapshot --write` | Save snapshot to `.pi/mekann-context/snapshots/` |
| `/context-ledger snapshot --write --max-bytes 4096` | Save budgeted snapshot |
| `/context-ledger restore` | Return latest snapshot or build from events |
| `/context-ledger restore --rebuild` | Rebuild from events ignoring latest snapshot |
| `/context-ledger restore --rebuild --write` | Rebuild and persist to disk |
| `/context-ledger restore --max-bytes 4096` | Restore with byte budget (default 4096) |
| `/context-ledger clear` | Delete context ledger data including events and snapshots (with confirmation) |

## Design

This module intentionally avoids:
- SQLite / FTS5 / embeddings
- Mutation of existing events
- Automatic injection into prompts (future)

The ledger is a raw event stream. Compaction and summarization happen at read time.
