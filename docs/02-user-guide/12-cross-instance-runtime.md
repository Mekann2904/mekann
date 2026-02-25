---
title: Cross-Instance Runtime
category: user-guide
audience: daily-user
last_updated: 2026-02-25
tags: [runtime, multi-instance, coordination, limits]
related: [./01-extensions.md, ./08-subagents.md, ./09-agent-teams.md]
---

# Cross-Instance Runtime

複数のpiインスタンス間で実行を協調させ、リソースを共有するためのクロスインスタンスランタイム機能。

## Overview

クロスインスタンスランタイムは、複数のpiインスタンスが協調してリソースを共有できるようにします：

- **協調型レート制限**: 複数インスタンス間でAPI呼び出しを分散
- **プロバイダー認識**: プロバイダーごとのレート制限を尊重
- **状態共有**: 実行ステータスの調整
- **負荷分散**: 複数インスタンスへの作業分散

### いつ使用するか

- レート制限のある並列ワークロードを実行する場合
- 複数チームが同じプロバイダーアカウントにアクセスする場合
- 大規模なコードベース分析を行う場合

## Architecture

### Coordination Model

```
┌─────────────┐     ┌─────────────────────┐     ┌─────────────┐
│ Instance 1  │────▶│ Cross-Instance      │◀────│ Instance 2  │
│             │     │ Coordinator         │     │             │
└─────────────┘     └─────────────────────┘     └─────────────┘
                           │
                           ▼
                   ┌───────────────┐
                   │ Provider      │
                   │ Rate Limits   │
                   └───────────────┘
```

### Key Components

- **cross-instance-coordinator**: 中央調整ロジック
- **provider-limits**: プロバイダーごとの制限追跡
- **cross-instance-runtime**: 拡張機能インターフェース
- **adaptive-rate-controller**: 429エラーからの適応学習

## Configuration

### Environment Variables

```bash
# クロスインスタンス調整を有効化
PI_CROSS_INSTANCE_ENABLED=true

# コーディネーターポート
PI_COORDINATOR_PORT=8765

# インスタンス識別子（インスタンスごとに一意）
PI_INSTANCE_ID=instance-1

# コーディネーターアドレス（他のインスタンス用）
PI_COORDINATOR_ADDR=localhost:8765
```

### Example Setup

```bash
# Terminal 1 - Instance 1
PI_INSTANCE_ID=instance-1 pi agent run

# Terminal 2 - Instance 2
PI_INSTANCE_ID=instance-2 pi agent run

# Terminal 3 - Instance 3
PI_INSTANCE_ID=instance-3 pi agent run
```

### Configuration File

`.pi/config.json` で設定を管理することもできます：

```json
{
  "crossInstance": {
    "enabled": true,
    "coordinatorPort": 8765,
    "instanceId": "instance-1",
    "coordinatorAddr": "localhost:8765",
    "providers": {
      "openai": {
        "requestsPerMinute": 500,
        "burst": 100
      },
      "anthropic": {
        "requestsPerMinute": 50,
        "burst": 25
      }
    }
  }
}
```

## Provider-Specific Limits

### Default Limits

| プロバイダー | リクエスト/分 | バースト | 備考 |
|------------|--------------|---------|------|
| openai     | 500          | 100     | gpt-4/gpt-3.5 |
| anthropic  | 50           | 25      | claude-3 |
| deepseek   | 1000         | 200     | deepseek-chat |
| gemini     | 60           | 15      | gemini-pro |

### Custom Limits

```typescript
// .pi/config.json でのカスタム制限
{
  "crossInstance": {
    "providers": {
      "openai": {
        "requestsPerMinute": 1000,
        "burst": 200
      },
      "anthropic": {
        "requestsPerMinute": 100,
        "burst": 50
      }
    }
  }
}
```

### プロバイダー制限の確認

```bash
# 現在のレート制限を確認
pi_model_limits

# 出力例:
# Provider: openai
#   Requests/minute: 500
#   Burst: 100
#   Current usage: 120/500
#
# Provider: anthropic
#   Requests/minute: 50
#   Burst: 25
#   Current usage: 5/50
```

## Usage Examples

### Example 1: 並列コード分析

```bash
# Instance 1
PI_INSTANCE_ID=analyzer-1 pi subagent_run researcher "Analyze src/core/"

# Instance 2 (同時実行)
PI_INSTANCE_ID=analyzer-2 pi subagent_run researcher "Analyze src/utils/"

# Instance 3 (同時実行)
PI_INSTANCE_ID=analyzer-3 pi subagent_run researcher "Analyze src/api/"

# コーディネーターがすべてのインスタンス間でレート制限を管理
```

### Example 2: チームベースの調整

```typescript
// すべてのチームインスタンスがコーディネーターを共有
await agent_team_run({
  teamId: "core-delivery-team",
  task: "大規模コードベースの分析とリファクタリング",
  strategy: "parallel",
  config: {
    crossInstance: true,
    coordinatorPort: 8765
  }
});
```

### Example 3: 複数チームの並列実行

```bash
# Terminal 1
PI_INSTANCE_ID=team-1 pi agent_team_run core-delivery-team "Implement feature A"

# Terminal 2
PI_INSTANCE_ID=team-2 pi agent_team_run bug-war-room "Fix critical bug B"

# Terminal 3
PI_INSTANCE_ID=team-3 pi agent_team_run research-team "Research pattern C"

# すべてのリクエストがプロバイダー制限を尊重して実行される
```

### Example 4: プログラムによるステータス確認

```typescript
// インスタンスのステータスを確認
const status = await pi_instance_status();

console.log(status);
/*
{
  instanceId: "instance-1",
  coordinatorConnected: true,
  providers: {
    openai: {
      requestsPerMinute: 500,
      currentUsage: 120,
      burstAvailable: 80
    }
  },
  activeRequests: 2
}
*/
```

## Best Practices

### 1. 一意なインスタンスID

```bash
# 良い例: 各インスタンスが一意なIDを持つ
PI_INSTANCE_ID=analyzer-1 pi agent run
PI_INSTANCE_ID=analyzer-2 pi agent run

# 悪い例: 重複するID（競合の原因）
PI_INSTANCE_ID=analyzer pi agent run  # Terminal 1
PI_INSTANCE_ID=analyzer pi agent run  # Terminal 2 (競合!)
```

### 2. 一貫したコーディネーターポート

```bash
# すべてのインスタンスで同じポートを使用
export PI_COORDINATOR_PORT=8765

PI_INSTANCE_ID=inst-1 pi agent run &
PI_INSTANCE_ID=inst-2 pi agent run &
PI_INSTANCE_ID=inst-3 pi agent run &
```

### 3. プロバイダー認識

使用するプロバイダーのレート制限を理解しておくことが重要です。

```bash
# 各プロバイダーの制限を確認
pi_model_limits --provider openai
pi_model_limits --provider anthropic
```

### 4. 使用状況の監視

```bash
# コーディネーターログでレート制限違反を確認
tail -f .pi/logs/coordinator.log

# ログ例:
# [2026-02-25 02:00:00] Instance analyzer-1 requested 1 request (openai)
# [2026-02-25 02:00:01] Approved: 121/500 requests used
# [2026-02-25 02:00:02] Instance analyzer-2 requested 1 request (openai)
# [2026-02-25 02:00:03] Approved: 122/500 requests used
```

### 5. グレースフルなデグレード

```typescript
// レート制限を考慮した実行
try {
  await subagent_run({ subagentId: "code-analyzer", task: "Analyze code" });
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    // コーディネーターがバックオフを処理
    console.log('Rate limit exceeded, waiting...');
    await retryWithBackoff(() =>
      subagent_run({ subagentId: "code-analyzer", task: "Analyze code" })
    );
  }
}
```

## Troubleshooting

### コーディネーターが応答しない

**問題**: インスタンスがコーディネーターに接続できない

**解決策**:
```bash
# コーディネーターが実行されているか確認
lsof -i :8765

# 出力例:
# COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
# node    12345 user   12u  IPv4  12345      0t0  TCP *:8765 (LISTEN)

# コーディネーターアドレスを確認
echo $PI_COORDINATOR_ADDR
# localhost:8765

# ポートが空いていることを確認
netstat -an | grep 8765
```

### レート制限違反

**問題**: 調整してもレート制限エラーが発生する

**解決策**:
```bash
# コーディネーターログを確認
tail -f .pi/logs/coordinator.log

# プロバイダー制限を確認
cat .pi/config/provider-limits.json

# 適切な制限を設定
# .pi/config.json
{
  "crossInstance": {
    "providers": {
      "openai": {
        "requestsPerMinute": 1000,  # 増やす
        "burst": 200
      }
    }
  }
}
```

### インスタンス間通信の失敗

**問題**: インスタンス間で通信ができない

**解決策**:
```bash
# ファイアウォール設定を確認
sudo ufw status

# 必要に応じてポートを開放
sudo ufw allow 8765/tcp

# localhostの設定を確認
cat /etc/hosts | grep localhost
# 127.0.0.1 localhost
```

### 429エラーの頻発

**問題**: 適応学習が機能していないように見える

**解決策**:
```bash
# 適応学習ログを確認
tail -f .pi/logs/adaptive-rate-controller.log

# 429エラーからの学習を確認
# [2026-02-25 02:00:00] 429 error detected, adjusting rate limit
# [2026-02-25 02:00:01] Reduced requests per minute from 500 to 450

# 適応学習をリセット（必要な場合）
rm .pi/data/adaptive-rate-state.json
```

## Advanced Usage

### 適応レート制御

429エラーからの適応学習により、レート制限を動的に調整します。

```typescript
// 適応学習が有効な場合、自動的に調整される
{
  "crossInstance": {
    "adaptiveRateControl": {
      "enabled": true,
      "reductionFactor": 0.9,      // エラー時に10%減少
      "recoveryFactor": 1.05,      // 成功時に5%増加
      "minRequestsPerMinute": 100, // 最小制限
      "maxRequestsPerMinute": 1000 // 最大制限
    }
  }
}
```

### インスタンスごとの優先度

```typescript
// 重要なインスタンスに高い優先度を割り当てる
{
  "crossInstance": {
    "instances": {
      "critical-worker": {
        "priority": 10,
        "reservedCapacity": 100
      },
      "background-worker": {
        "priority": 1,
        "reservedCapacity": 50
      }
    }
  }
}
```

### 監視とアラート

```typescript
// カスタム監視の実装
import { subscribe_coordinator_events } from '@mekann/cross-instance-runtime';

await subscribe_coordinator_events({
  onRateLimitWarning: (provider, usage) => {
    if (usage > 0.8) {
      console.warn(`High usage for ${provider}: ${(usage * 100).toFixed(0)}%`);
    }
  },
  onInstanceConnected: (instanceId) => {
    console.log(`Instance connected: ${instanceId}`);
  },
  onInstanceDisconnected: (instanceId) => {
    console.error(`Instance disconnected: ${instanceId}`);
  }
});
```

## API Reference

### pi_instance_status

すべてのpiインスタンスの状態を確認します。

```bash
pi_instance_status
```

**出力**:
```
Instance: instance-1
  Status: Connected
  Active requests: 2
  Provider usage:
    openai: 120/500 requests (24%)
    anthropic: 5/50 requests (10%)

Instance: instance-2
  Status: Connected
  Active requests: 1
  Provider usage:
    openai: 80/500 requests (16%)
    anthropic: 3/50 requests (6%)
```

### pi_model_limits

プロバイダー/モデル別のレート制限を確認します。

```bash
pi_model_limits [--provider <provider>]
```

**オプション**:
- `--provider`: 特定のプロバイダーの制限を表示

## 関連ドキュメント

- [Subagents](08-subagents.md) - サブエージェントの使用方法
- [Agent Teams](09-agent-teams.md) - エージェントチームの使用方法
- [Dynamic Tools](13-dynamic-tools.md) - 動的ツールの使用方法
