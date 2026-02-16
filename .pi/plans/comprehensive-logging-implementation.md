---
title: 包括的ログ収集システム実装計画
category: development
audience: developer
last_updated: 2026-02-16
tags: [logging, observability, debugging, implementation-plan]
related: [comprehensive-logger, extensions, skills]
---

# 包括的ログ収集システム実装計画

## 概要

エラー有無に関わらず全操作を機械的に記録し、後から分析・再現できる「包括的Observabilityシステム」を実装する。

## 設計方針

| 方針 | 内容 |
|------|------|
| **目的** | エラー有無に関わらず全操作を機械的記録 |
| **保存形式** | JSON Lines（追記のみ、軽量） |
| **粒度** | 階層的（Session > Task > Operation > Tool） |
| **分析機能** | 後で追加（まずは収集に集中） |
| **実装** | 段階的（拡張機能から開始） |

## 階層構造

```
Session（セッション全体）
├── Task 1（ユーザー依頼）
│   ├── Operation 1.1（サブエージェント呼び出し）
│   │   ├── Tool 1.1.1（read）
│   │   ├── Tool 1.1.2（edit）
│   │   └── Tool 1.1.3（bash）
│   └── Operation 1.2（チーム実行）
│       └── Tool 1.2.1（subagent_run_parallel）
├── Task 2
│   └── ...
└── Task N
```

## イベント種別

| カテゴリ | イベント | 説明 |
|----------|---------|------|
| ライフサイクル | session_start/end | セッション全体 |
| ライフサイクル | task_start/end | ユーザー依頼単位 |
| ライフサイクル | operation_start/end | 操作単位 |
| ツール | tool_call/result/error | ツール呼び出し |
| LLM | llm_request/response/error | LLM通信 |
| ユーザー | user_input/feedback | ユーザー操作 |
| システム | config_load/state_change/metrics_snapshot | システム状態 |

---

## Phase 0: 基盤構築

### タスク

| ID | タスク | ファイル | 行数 |
|----|--------|----------|------|
| 0-1 | 型定義 | `.pi/lib/comprehensive-logger-types.ts` | 約150行 |
| 0-2 | ロガー実装 | `.pi/lib/comprehensive-logger.ts` | 約200行 |
| 0-3 | 設定管理 | `.pi/lib/comprehensive-logger-config.ts` | 約50行 |
| 0-4 | 初期化 | `.pi/logs/` 作成 + .gitignore | - |

### インターフェース設計

#### BaseEvent（全イベント共通）

```typescript
interface BaseEvent {
  eventId: string;           // UUID v4
  eventType: EventType;
  sessionId: string;
  taskId: string;
  operationId: string;
  parentEventId?: string;
  timestamp: string;         // ISO 8601 + ナノ秒
  component: {
    type: 'extension' | 'subagent' | 'team' | 'skill' | 'tool';
    name: string;
    version?: string;
    filePath?: string;
  };
}
```

#### 主要イベント型

- SessionStartEvent / SessionEndEvent
- TaskStartEvent / TaskEndEvent
- OperationStartEvent / OperationEndEvent
- ToolCallEvent / ToolResultEvent / ToolErrorEvent
- LLMRequestEvent / LLMResponseEvent
- StateChangeEvent
- MetricsSnapshotEvent

---

## Phase 1: 拡張機能への適用

### 優先度分類

| 優先度 | 対象拡張機能 | 理由 |
|--------|-------------|------|
| **S** | subagents.ts, agent-teams.ts | コアオーケストレーション |
| **A** | dynamic-tools.ts, usage-tracker.ts, agent-usage-tracker.ts | 既にメトリクス収集あり |
| **B** | loop.ts, plan.ts, verification-hooks.ts | 中程度の重要性 |
| **C** | fzf.ts, abbr.ts, kitty-status-integration.ts | 軽量機能 |
| **D** | agent-idle-indicator.ts, question.ts | 最小限で十分 |

### 実装順序

#### Step 1: Sランク

- [ ] subagents.ts - ツール呼び出しラップ、操作単位記録（約30行追加）
- [ ] agent-teams.ts - チーム実行記録、メンバー操作記録（約30行追加）

#### Step 2: Aランク

- [ ] dynamic-tools.ts - ツール生成/実行記録（約20行追加）
- [ ] usage-tracker.ts - 使用量メトリクス記録（約15行追加）
- [ ] agent-usage-tracker.ts - 使用量統合（約15行追加）

#### Step 3: Bランク

- [ ] loop.ts - 反復処理記録（約10行追加）
- [ ] plan.ts - 計画操作記録（約10行追加）
- [ ] verification-hooks.ts - 検証処理記録（約10行追加）

#### Step 4: C/Dランク

- [ ] fzf.ts, abbr.ts, kitty-status-integration.ts - 最小限ラッピング
- [ ] agent-idle-indicator.ts, question.ts - 最小限

---

## Phase 2: ストレージ層への適用

### タスク

| ID | タスク | 対象 | 行数 |
|----|--------|------|------|
| 2-1 | RunRecord拡張 | agent-teams/storage.ts | 約20行 |
| 2-2 | RunRecord拡張 | subagents/storage.ts | 約15行 |

### 変更内容

- TeamRunRecord / SubagentRunRecord にイベントID追加
- ファイル作成/更新/削除の状態変更ログ記録

---

## Phase 3: スキル・チーム定義への適用

### タスク

| ID | タスク | 対象 | 数量 |
|----|--------|------|------|
| 3-1 | デバッグ情報セクション追加 | SKILL.md | 8ファイル |
| 3-2 | トラブルシューティング追加 | team.md | 18ファイル |

### ドキュメントテンプレート

```markdown
## デバッグ情報

### 記録されるイベント
- [このスキル/チームで記録されるイベント一覧]

### ログ確認方法
- [ログの検索・フィルタ方法]

### トラブルシューティング
| 症状 | 原因 | 確認方法 | 解決策 |
|------|------|---------|--------|
| ... | ... | ... | ... |
```

---

## Phase 4: 分析ツール（後日実装予定）

### 予定機能

| 機能 | 説明 |
|------|------|
| クエリ検索 | CLI/関数でログ検索・フィルタ |
| 統計ダッシュボード | 使用頻度、成功率、時間の統計 |
| 自動異常検知 | エラー検出、異常値検知 |
| 実行再現 | 記録から再実行スクリプト生成 |

---

## ファイル構成

```
.pi/
├── logs/
│   ├── events-2026-02-16.jsonl
│   ├── events-2026-02-15.jsonl
│   └── ...
├── lib/
│   ├── comprehensive-logger.ts
│   ├── comprehensive-logger-types.ts
│   └── comprehensive-logger-config.ts
├── extensions/
│   └── [各拡張機能でロガーを使用]
└── plans/
    └── comprehensive-logging-implementation.md（このファイル）
```

---

## スケジュール

| フェーズ | 期間 | 成果物 |
|----------|------|--------|
| Phase 0 | 1ターン | ロガー基盤 |
| Phase 1-Step1 | 1ターン | Sランク統合 |
| Phase 1-Step2 | 1ターン | Aランク統合 |
| Phase 1-Step3 | 1ターン | Bランク統合 |
| Phase 2 | 1ターン | ストレージ層統合 |
| Phase 3 | 1ターン | ドキュメント更新 |

**合計**: 約6ターン

---

## 現在の状態

- [x] P1: 現状調査完了
- [x] P2: テンプレート案作成完了
- [x] P3: 実装計画作成完了
- [x] Phase 0: 基盤構築完了
  - [x] comprehensive-logger-types.ts (約300行)
  - [x] comprehensive-logger-config.ts (約130行)
  - [x] comprehensive-logger.ts (約400行)
  - [x] logsディレクトリ作成
- [x] Phase 1: 拡張機能統合完了
  - [x] Step 1: Sランク (subagents.ts, agent-teams.ts)
  - [x] Step 2: Aランク (dynamic-tools.ts, usage-tracker.ts, agent-usage-tracker.ts)
  - [x] Step 3: Bランク (loop.ts, plan.ts, verification-hooks.ts)
- [x] Phase 2: ストレージ層統合完了
  - [x] agent-teams/storage.ts (correlationId, parentEventId, logStateChange)
  - [x] subagents/storage.ts (correlationId, parentEventId, logStateChange)
- [x] Phase 3: ドキュメント更新完了
  - [x] スキル (8ファイル): agent-estimation, alma-memory, clean-architecture, code-review, dynamic-tools, git-workflow, harness-engineering, logical-analysis
  - [x] チーム定義 (16ファイル): bug-war-room, code-excellence-review, core-delivery, design-discovery, doc-gardening, docs-enablement, file-organizer, garbage-collection, logical-analysis, mermaid-diagram, rapid-swarm, refactor-migration, research, security-hardening, skill-creation, verification-phase

---

## 完了サマリ

### 作成された基盤ファイル

| ファイル | 行数 | 説明 |
|----------|------|------|
| `.pi/lib/comprehensive-logger-types.ts` | 300行 | イベント型定義 |
| `.pi/lib/comprehensive-logger-config.ts` | 130行 | 設定管理 |
| `.pi/lib/comprehensive-logger.ts` | 400行 | ロガー実装 |
| `.pi/logs/` | - | ログ出力先 |

### 統合された拡張機能

| ファイル | start | end |
|----------|-------|-----|
| subagents.ts | 2 | 3 |
| agent-teams.ts | 2 | 3 |
| dynamic-tools.ts | 3 | 11 |
| usage-tracker.ts | 1 | 2 |
| agent-usage-tracker.ts | 1 | 5 |
| loop.ts | 1 | 2 |
| plan.ts | 5 | 5 |
| verification-hooks.ts | 2 | 6 |

### 統合されたストレージ

| ファイル | 追加フィールド |
|----------|---------------|
| agent-teams/storage.ts | correlationId, parentEventId |
| subagents/storage.ts | correlationId, parentEventId |

### ドキュメント更新

| カテゴリ | ファイル数 |
|----------|-----------|
| スキル | 8 |
| チーム定義 | 16 |

**合計: 24ファイル**

### Phase 1 統合サマリ

| 拡張機能 | ランク | startOperation | endOperation |
|----------|--------|----------------|--------------|
| subagents.ts | S | 2 | 3 |
| agent-teams.ts | S | 2 | 3 |
| dynamic-tools.ts | A | 3 | 11 |
| usage-tracker.ts | A | 1 | 2 |
| agent-usage-tracker.ts | A | 1 | 5 |
| loop.ts | B | 1 | 2 |
| plan.ts | B | 5 | 5 |
| verification-hooks.ts | B | 2 | 6 |
