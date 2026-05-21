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

## Commands

| Command | Description |
|---------|-------------|
| `/context-ledger` | Show status |
| `/context-ledger list` | List recent events (newest 20) |
| `/context-ledger stats` | Aggregate stats by kind and priority |
| `/context-ledger snapshot` | Build XML session snapshot from events |
| `/context-ledger clear` | Delete all events (with confirmation) |

## Design

This module intentionally avoids:
- SQLite / FTS5 / embeddings
- Mutation of existing events
- Automatic injection into prompts (future: snapshot builder)

The ledger is a raw event stream. Compaction and summarization happen at read time.
