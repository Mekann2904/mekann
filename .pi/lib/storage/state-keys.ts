/**
 * path: .pi/lib/storage/state-keys.ts
 * role: SQLite json_state のキー名を集約する
 * why: ストレージごとにバラバラなキー文字列を防ぎ、移行後の参照先を統一する
 * related: .pi/lib/storage/sqlite-state-store.ts, .pi/extensions/subagents/storage.ts, .pi/lib/storage/run-index.ts, .pi/lib/storage/pattern-extraction.ts
 */

export function getSubagentStorageStateKey(cwd: string): string {
  return `subagents_storage:${cwd}`;
}

export function getAgentTeamStorageStateKey(cwd: string): string {
  return `agent_teams_storage:${cwd}`;
}

export function getTaskStorageStateKey(cwd: string): string {
  return `task_storage:${cwd}`;
}

export function getPlanStorageStateKey(cwd: string): string {
  return `plan_storage:${cwd}`;
}

export function getPlanModeStateKey(cwd: string): string {
  return `plan_mode_state:${cwd}`;
}

export function getRunIndexStateKey(cwd: string): string {
  return `memory_run_index:${cwd}`;
}

export function getPatternStorageStateKey(cwd: string): string {
  return `memory_patterns:${cwd}`;
}

export function getIndexSettingsStateKey(cwd: string): string {
  return `index_settings:${cwd}`;
}
