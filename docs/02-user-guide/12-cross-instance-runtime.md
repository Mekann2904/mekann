---
title: クロスインスタンスランタイム
category: user-guide
audience: daily-user, developer
last_updated: 2026-02-16
tags: [cross-instance, runtime, parallel, coordination]
related: [./08-subagents.md, ./09-agent-teams.md]
---

# クロスインスタンスランタイム

> パンくず: [Home](../README.md) > [User Guide](./) > クロスインスタンスランタイム

## 概要

クロスインスタンスランタイムは、複数のpiインスタンス間での並列実行数を自動調整する機能です。プロバイダー（OpenAI、Anthropic等）およびモデル別にレート制限を管理し、429エラー（レート制限超過）を回避しながら最適な並列度を実現します。

## 機能一覧

### ツール

| ツール名 | 説明 |
|---------|------|
| `pi_instance_status` | 現在起動中のpiインスタンス一覧と各インスタンスの状態を表示 |
| `pi_model_limits` | プロバイダー/モデル別のレート制限設定と現在の使用状況を表示 |

### コマンド

| コマンド | 説明 |
|---------|------|
| `/pi-instances` | piインスタンス一覧を表示 |
| `/pi-limits` | モデル別レート制限を表示 |
| `/pi-limits-reset` | レート制限カウンターをリセット（管理者用） |

## アーキテクチャ

### シーケンス図

```mermaid
sequenceDiagram
    autonumber
    participant User as ユーザー
    participant PI1 as piインスタンス1
    participant PI2 as piインスタンス2
    participant Coord as Coordinator
    participant FS as ファイルシステム

    Note over User,FS: インスタンス起動時
    PI1->>FS: インスタンス情報登録
    PI2->>FS: インスタンス情報登録
    FS->>Coord: 登録通知

    Note over User,FS: 並列実行要求
    User->>PI1: subagent_run_parallel (3エージェント)
    PI1->>Coord: キャパシティ要求
    Coord->>FS: 現在の使用状況確認
    FS-->>Coord: 使用状況返却
    Coord->>Coord: 並列度計算
    Note right of Coord: 計算式:<br/>allowedParallel = min(<br/>  requested,<br/>  globalLimit - currentUsage<br/>)
    Coord-->>PI1: 許可される並列数 (2)
    PI1->>PI1: 2エージェント並列実行
    PI1->>Coord: 残り1エージェント要求
    Coord-->>PI1: キャパシティ確保完了
    PI1->>PI1: 残り1エージェント実行

    Note over User,FS: インスタンス間協調
    User->>PI2: agent_team_run (1チーム)
    PI2->>Coord: キャパシティ要求
    Coord->>FS: PI1の使用状況確認
    FS-->>Coord: PI1使用中 (2スロット)
    Coord->>Coord: 残りキャパシティ計算
    Coord-->>PI2: 許可される並列数 (2)
    PI2->>PI2: チームメンバー2並列実行

    Note over User,FS: 終了時
    PI1->>FS: インスタンス情報削除
    PI2->>FS: インスタンス情報削除
```

### プロバイダー/モデル別制限

```mermaid
flowchart TD
    subgraph Provider["プロバイダー別制限"]
        OpenAI["OpenAI<br/>gpt-4o: 500 RPM<br/>gpt-4o-mini: 1000 RPM"]
        Anthropic["Anthropic<br/>claude-3.5-sonnet: 1000 RPM<br/>claude-3.5-haiku: 2000 RPM"]
        Gemini["Gemini<br/>gemini-1.5-pro: 300 RPM"]
    end

    subgraph Coordinator["Coordinator"]
        Tracker["使用量トラッカー"]
        Calculator["並列度計算"]
        Limiter["レートリミッター"]
    end

    subgraph Instance["インスタンス"]
        PI1["pi #1"]
        PI2["pi #2"]
        PI3["pi #3"]
    end

    Provider --> Tracker
    Instance --> Calculator
    Tracker --> Calculator
    Calculator --> Limiter
    Limiter --> Instance
```

## 設定

### 環境変数

| 変数名 | デフォルト | 説明 |
|--------|----------|------|
| `PI_COORDINATOR_PATH` | `~/.pi-coordinator` | Coordinatorの状態保存パス |
| `PI_COORDINATOR_POLL_MS` | `500` | 状態確認のポーリング間隔（ミリ秒） |
| `PI_COORDINATOR_LOCK_TIMEOUT_MS` | `10000` | ロック取得タイムアウト（ミリ秒） |
| `PI_COORDINATOR_HEARTBEAT_MS` | `5000` | インスタンス生存確認間隔（ミリ秒） |

### プロバイダー別制限のカスタマイズ

`.pi/lib/provider-limits.ts` で定義された制限を環境変数で上書き可能：

```bash
# OpenAI GPT-4oのRPM制限
PI_PROVIDER_LIMIT_OPENAI_GPT4O_RPM=1000

# Anthropic Claude 3.5 SonnetのRPM制限
PI_PROVIDER_LIMIT_ANTHROPIC_CLAUDE35SONNET_RPM=2000
```

## 使用例

### インスタンス状態確認

```
> pi_instance_status

Active pi Instances (2):
┌─────────────────────────────────────┬──────────┬─────────────────┬───────────┐
│ Instance ID                         │ PID      │ Model           │ Active    │
├─────────────────────────────────────┼──────────┼─────────────────┼───────────┤
│ pi-abc123def456                     │ 12345    │ gpt-4o          │ 3 agents  │
│ pi-xyz789ghi012                     │ 67890    │ claude-3.5-sonnet │ 1 team   │
└─────────────────────────────────────┴──────────┴─────────────────┴───────────┘

Global Capacity: 5/8 LLMs active
```

### モデル別制限確認

```
> pi_model_limits

Provider/Model Rate Limits:
┌──────────────────────┬─────────┬──────────┬───────────┐
│ Model                │ RPM     │ Current  │ Remaining │
├──────────────────────┼─────────┼──────────┼───────────┤
│ openai/gpt-4o        │ 500     │ 120      │ 380       │
│ openai/gpt-4o-mini   │ 1000    │ 50       │ 950       │
│ anthropic/claude-3.5 │ 1000    │ 200      │ 800       │
│ anthropic/claude-3.5 │ 2000    │ 30       │ 1970      │
└──────────────────────┴─────────┴──────────┴───────────┘
```

## エラーハンドリング

### 429エラー（レート制限超過）時の動作

```mermaid
flowchart TD
    Request[リクエスト送信] --> Check{429エラー?}
    Check -->|No| Success[成功]
    Check -->|Yes| Retry{リトライ可能?}
    Retry -->|Yes| Backoff[指数バックオフ待機]
    Backoff --> Request
    Retry -->|No| Fail[失敗・ユーザー通知]
    
    Retry -->|retry-afterヘッダーあり| Wait[retry-after待機]
    Wait --> Request
```

### Adaptive Rate Controller

429エラーから学習し、自動的に並列度を調整：

```typescript
// 適応的ペナルティ計算
adaptivePenalty.raise(reason: string): void
  - penalty = min(maxPenalty, penalty + reasonWeights[reason])
  - effectiveParallelism = max(1, floor(baseLimit / (penalty + 1)))

adaptivePenalty.lower(): void
  - penalty = penalty * decayMultiplier (default: 0.5)
```

## トラブルシューティング

### よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 並列実行が期待より少ない | 他インスタンスがリソース使用中 | `pi_instance_status` で確認 |
| 429エラー頻発 | プロバイダー制限超過 | 並列度を下げる、または制限を確認 |
| インスタンスが表示されない | Coordinatorパス不一致 | `PI_COORDINATOR_PATH` を確認 |

---

## 関連トピック

- [サブエージェント](./08-subagents.md) - サブエージェントの詳細
- [エージェントチーム](./09-agent-teams.md) - チーム実行の詳細
- [設定](../04-reference/01-configuration.md) - 環境変数の詳細

## 次のトピック

[→ 検索ツール](./15-search-tools.md)
