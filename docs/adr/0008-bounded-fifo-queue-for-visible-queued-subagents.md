# Bounded FIFO queue for visible queued subagents

`spawn_agent` は実行中 subagent 上限を超えた delegation を、デフォルトで bounded global FIFO queue に受理する。Queued subagent は即時に `agent_id` を持つ可視 agent として表現し、`list_agents` / `wait_agent` で観測でき、`close_agent` で `shutdown` としてキャンセルできる。これは、LLM に空きスロット待ちのスケジューリングを何ターンも行わせるトークンコストを避けつつ、hidden backlog ではなく観測可能な control plane 状態として pending work を保持するためである。キューは `maxQueuedSubagents` で制限し、実行スロットが空いたら非同期に FIFO drain する。
