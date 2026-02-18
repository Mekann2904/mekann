---
title: runtime-config
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated]
related: []
---

# runtime-config

## 概要

`runtime-config` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `getRuntimeConfig` | 実行時設定を取得する |
| 関数 | `getConfigVersion` | 現在の設定バージョンを取得します。 |
| 関数 | `reloadRuntimeConfig` | 実行時に環境変数から設定を再読み込みする。 |
| 関数 | `getRuntimeProfile` | 現在のランタイムプロファイルを取得する。 |
| 関数 | `isStableProfile` | 安定版プロファイルで動作しているか判定する。 |
| 関数 | `validateConfigConsistency` | 設定の整合性を検証する |
| 関数 | `formatRuntimeConfig` | 実行時設定を整形して文字列で返す |
| インターフェース | `RuntimeConfig` | ランタイム設定の集中管理 |
| 型 | `RuntimeProfile` | ランタイムプロファイルモード |

## 図解

### クラス図

```mermaid
classDiagram
  class RuntimeConfig {
    <<interface>>
    +profile: RuntimeProfile
    +totalMaxLlm: number
    +totalMaxRequests: number
    +maxParallelSubagents: number
    +maxParallelTeams: number
  }
```

### 関数フロー

```mermaid
flowchart TD
  getRuntimeConfig["getRuntimeConfig()"]
  getConfigVersion["getConfigVersion()"]
  reloadRuntimeConfig["reloadRuntimeConfig()"]
  getRuntimeProfile["getRuntimeProfile()"]
  isStableProfile["isStableProfile()"]
  validateConfigConsistency["validateConfigConsistency()"]
  getRuntimeConfig -.-> getConfigVersion
  getConfigVersion -.-> reloadRuntimeConfig
  reloadRuntimeConfig -.-> getRuntimeProfile
  getRuntimeProfile -.-> isStableProfile
  isStableProfile -.-> validateConfigConsistency
```

## 関数

### parseBoolean

```typescript
parseBoolean(value: string | undefined): boolean | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string | undefined` | はい |

**戻り値**: `boolean | undefined`

### parseNumber

```typescript
parseNumber(value: string | undefined, min?: number, max?: number): number | undefined
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| value | `string | undefined` | はい |
| min | `number` | いいえ |
| max | `number` | いいえ |

**戻り値**: `number | undefined`

### detectProfile

```typescript
detectProfile(): RuntimeProfile
```

**戻り値**: `RuntimeProfile`

### getRuntimeConfig

```typescript
getRuntimeConfig(): RuntimeConfig
```

実行時設定を取得する

**戻り値**: `RuntimeConfig`

### getConfigVersion

```typescript
getConfigVersion(): number
```

現在の設定バージョンを取得します。

**戻り値**: `number`

### reloadRuntimeConfig

```typescript
reloadRuntimeConfig(): RuntimeConfig
```

実行時に環境変数から設定を再読み込みする。

**戻り値**: `RuntimeConfig`

### getRuntimeProfile

```typescript
getRuntimeProfile(): RuntimeProfile
```

現在のランタイムプロファイルを取得する。

**戻り値**: `RuntimeProfile`

### isStableProfile

```typescript
isStableProfile(): boolean
```

安定版プロファイルで動作しているか判定する。

**戻り値**: `boolean`

### validateConfigConsistency

```typescript
validateConfigConsistency(): {
  consistent: boolean;
  warnings: string[];
  details: Record<string, unknown>;
}
```

設定の整合性を検証する

**戻り値**: `{
  consistent: boolean;
  warnings: string[];
  details: Record<string, unknown>;
}`

### formatRuntimeConfig

```typescript
formatRuntimeConfig(): string
```

実行時設定を整形して文字列で返す

**戻り値**: `string`

## インターフェース

### RuntimeConfig

```typescript
interface RuntimeConfig {
  profile: RuntimeProfile;
  totalMaxLlm: number;
  totalMaxRequests: number;
  maxParallelSubagents: number;
  maxParallelTeams: number;
  maxParallelTeammates: number;
  maxConcurrentOrchestrations: number;
  adaptiveEnabled: boolean;
  predictiveEnabled: boolean;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
  recoveryIntervalMs: number;
  reductionFactor: number;
  recoveryFactor: number;
  maxConcurrentPerModel: number;
  maxTotalConcurrent: number;
  capacityWaitMs: number;
  capacityPollMs: number;
}
```

ランタイム設定の集中管理

## 型定義

### RuntimeProfile

```typescript
type RuntimeProfile = "stable" | "default"
```

ランタイムプロファイルモード
- stable: 信頼性重視の制限 (4並列)
- default: バランス型の制限 (8並列)

---
*自動生成: 2026-02-18T07:17:30.479Z*
