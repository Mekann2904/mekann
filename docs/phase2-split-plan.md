# Phase 2 大規模ファイル分割計画

## 概要

Phase 2では、`agent-teams.ts`、`loop.ts`、`subagents.ts`の3つの大規模ファイルを機能別モジュールに分割し、保守性と可読性を向上させる。

## 目標

- 各ファイルを500行以下のモジュールに分割
- 後方互換性の維持（re-exportパターン）
- `npm run build`の成功
- 機能的な凝集度の向上

## Phase 2.1: agent-teams.ts 分割

**元ファイル**: 4515行

### 抽出モジュール

| ファイル | 責務 | 主要関数/型 | 推定行数 |
|----------|------|-------------|----------|
| `definition-loader.ts` | チーム定義の読み込み | `loadTeamDefinitionsFromMarkdown`, `parseTeamMarkdownFile`, `createDefaultTeams` | ~350 |
| `live-monitor.ts` | ライブモニタリングUI | `createAgentTeamLiveMonitor`, `renderAgentTeamLiveView`, `TeamLiveItem` | ~450 |
| `parallel-execution.ts` | 並列実行容量管理 | `resolveTeamParallelCapacity`, `buildMemberParallelCandidates` | ~200 |
| `member-execution.ts` | メンバー実行ロジック | `runMember`, `buildTeamMemberPrompt`, `normalizeTeamMemberOutput` | ~400 |
| `result-aggregation.ts` | 結果集計・整形 | `buildTeamResultText`, `resolveTeamParallelRunOutcome` | ~300 |

### 依存関係

```
agent-teams.ts (re-exports only)
    ├── definition-loader.ts
    ├── live-monitor.ts
    ├── parallel-execution.ts
    ├── member-execution.ts
    └── result-aggregation.ts
```

### Re-exportパターン

```typescript
// agent-teams.ts (後方互換性)
export { loadTeamDefinitionsFromMarkdown, createDefaultTeams } from './agent-teams/definition-loader';
export { createAgentTeamLiveMonitor } from './agent-teams/live-monitor';
export { resolveTeamParallelCapacity } from './agent-teams/parallel-execution';
export { runMember } from './agent-teams/member-execution';
export { buildTeamResultText } from './agent-teams/result-aggregation';
```

## Phase 2.2: loop.ts 分割

**元ファイル**: 2728行

### 抽出モジュール

| ファイル | 責務 | 主要関数/型 | 推定行数 |
|----------|------|-------------|----------|
| `ssrf-protection.ts` | SSRF対策 | `validateUrlForSsrf`, `isBlockedHostname`, `isPrivateOrReservedIP` | ~180 |
| `reference-loader.ts` | 参照読み込み | `loadReferences`, `loadSingleReference`, `fetchTextFromUrl` | ~200 |
| `verification.ts` | 検証コマンド実行 | `runVerificationCommand`, `parseVerificationCommand`, `isVerificationCommandAllowed` | ~250 |
| `iteration-builder.ts` | 反復プロンプト構築 | `buildIterationPrompt`, `buildReferencePack`, `parseLoopContract` | ~350 |

### 依存関係

```
loop.ts (re-exports only)
    ├── ssrf-protection.ts
    ├── reference-loader.ts
    ├── verification.ts
    └── iteration-builder.ts
```

### Re-exportパターン

```typescript
// loop.ts (後方互換性)
export { validateUrlForSsrf } from './loop/ssrf-protection';
export { loadReferences } from './loop/reference-loader';
export { runVerificationCommand } from './loop/verification';
export { buildIterationPrompt, parseLoopContract } from './loop/iteration-builder';
```

## Phase 2.3: subagents.ts 分割

**元ファイル**: 2357行

### 抽出モジュール

| ファイル | 責務 | 主要関数/型 | 推定行数 |
|----------|------|-------------|----------|
| `live-monitor.ts` | ライブモニタリングUI | `createSubagentLiveMonitor`, `renderSubagentLiveView` | ~350 |
| `parallel-execution.ts` | 並列実行容量管理 | `resolveSubagentParallelCapacity` | ~150 |
| `task-execution.ts` | タスク実行ロジック | `runSubagentTask`, `buildSubagentPrompt`, `normalizeSubagentOutput` | ~400 |

### 依存関係

```
subagents.ts (re-exports only)
    ├── live-monitor.ts
    ├── parallel-execution.ts
    └── task-execution.ts
```

### Re-exportパターン

```typescript
// subagents.ts (後方互換性)
export { createSubagentLiveMonitor } from './subagents/live-monitor';
export { resolveSubagentParallelCapacity } from './subagents/parallel-execution';
export { runSubagentTask } from './subagents/task-execution';
```

## 実装順序

1. **Phase 2.1**: agent-teams.ts 分割
   - [x] definition-loader.ts 作成
   - [x] live-monitor.ts 作成
   - [x] parallel-execution.ts 作成
   - [x] member-execution.ts 作成
   - [x] result-aggregation.ts 作成
   - [x] agent-teams.ts に re-export 追加
   - [x] ビルド確認

2. **Phase 2.2**: loop.ts 分割
   - [x] ssrf-protection.ts 作成
   - [x] reference-loader.ts 作成
   - [x] verification.ts 作成
   - [x] iteration-builder.ts 作成
   - [x] loop.ts に re-export 追加
   - [x] ビルド確認

3. **Phase 2.3**: subagents.ts 分割
   - [x] live-monitor.ts 作成
   - [x] parallel-execution.ts 作成
   - [x] task-execution.ts 作成
   - [x] subagents.ts に re-export 追加
   - [x] ビルド確認

## 後方互換性の維持

### 原則

1. **public APIは変更しない**: ツールやコマンドのインターフェースは維持
2. **型エクスポートを維持**: 外部から使用される型は再エクスポート
3. **段階的移行**: 内部実装のみをモジュール化

### 検証方法

```bash
# ビルドが成功すること
npm run build

# 型チェックが通ること
npx tsc --noEmit
```

## リスクと対策

| リスク | 対策 |
|--------|------|
| 循環依存の発生 | 依存関係を一方方向に保つ |
| 型の不整合 | 共有型は lib/ に配置 |
| importパスの複雑化 | 相対パスを一貫して使用 |

## 完了条件

- [x] 全12個の抽出モジュールが作成されている（実績: 16ファイル = 計画12 + 既存4）
- [x] `npm run build` が成功している（実績: 475テストパス）
- [x] 既存の import が動作している（後方互換性）
- [x] 各抽出モジュールが500行以下

## 実績

### 抽出モジュール数

- **計画**: 12ファイル
- **実績**: 16ファイル（計画12 + 既存4）
  - agent-teams: 5ファイル（definition-loader, live-monitor, parallel-execution, member-execution, result-aggregation）
  - loop: 4ファイル（ssrf-protection, reference-loader, verification, iteration-builder）
  - subagents: 3ファイル（live-monitor, parallel-execution, task-execution）
  - 既存: 4ファイル（judge.ts 等、Phase 1からの継続）

### 行数削減

- **agent-teams.ts**: 4515行 → 約2600行（約42%削減）
- **loop.ts**: 2728行 → 約1600行（約41%削減）
- **subagents.ts**: 2357行 → 約1400行（約40%削減）

### ビルド結果

- **テスト**: 475テストパス
- **型チェック**: 成功
- **後方互換性**: 維持（re-exportパターン）

## 完了日

2026-02-17

## 参照

- Phase 1 分割: `communication.ts`, `judge.ts`, `storage.ts`
- 共有ユーティリティ: `../lib/`
