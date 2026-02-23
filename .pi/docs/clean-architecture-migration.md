---
title: クリーンアーキテクチャ移行計画
category: development
audience: developer
last_updated: 2026-02-23
tags: [architecture, clean-architecture, refactoring]
related: [clean-architecture/SKILL.md]
---

# クリーンアーキテクチャ移行計画

## 方針

- **移行方式**: 段階的移行（新規ファイルから適用、既存は徐々に）
- **原則の重み**: バランス（CCP/REP/CRPのトレードオフを認識）

## 4層レイヤー構造

```
.pi/
├── core/                          # Layer 1: Enterprise Business Rules
│   ├── domain/                    # ドメインエンティティ
│   │   ├── agent.ts              # エージェントのドメインモデル
│   │   ├── team.ts               # チームのドメインモデル
│   │   ├── task.ts               # タスクのドメインモデル
│   │   └── plan.ts               # プランのドメインモデル
│   ├── value-objects/            # 値オブジェクト
│   │   ├── run-id.ts
│   │   ├── timeout.ts
│   │   └── rate-limit.ts
│   └── services/                  # ドメインサービス
│       ├── runtime-calculator.ts
│       └── priority-comparator.ts
│
├── application/                   # Layer 2: Application Business Rules
│   ├── use-cases/                 # ユースケース
│   │   ├── subagent/
│   │   │   ├── run-subagent.ts
│   │   │   ├── create-subagent.ts
│   │   │   └── list-subagents.ts
│   │   ├── team/
│   │   │   ├── run-team.ts
│   │   │   ├── create-team.ts
│   │   │   └── list-teams.ts
│   │   ├── loop/
│   │   │   ├── run-loop.ts
│   │   │   └── stop-loop.ts
│   │   └── plan/
│   │       ├── create-plan.ts
│   │       └── update-step.ts
│   ├── ports/                     # インターフェース（Output Boundary）
│   │   ├── llm-provider.ts
│   │   ├── storage.ts
│   │   └── logger.ts
│   └── dto/                       # データ転送オブジェクト
│       ├── input/
│       └── output/
│
├── adapters/                      # Layer 3: Interface Adapters
│   ├── controllers/               # 入力変換
│   │   ├── subagent-controller.ts
│   │   ├── team-controller.ts
│   │   └── loop-controller.ts
│   ├── presenters/                # 出力変換
│   │   ├── subagent-presenter.ts
│   │   ├── team-presenter.ts
│   │   └── tui-presenter.ts
│   ├── gateways/                  # 外部システムとの接続
│   │   ├── pi-gateway.ts         # pi APIとの接続
│   │   ├── storage-gateway.ts    # ファイルストレージ
│   │   └── logger-gateway.ts     # ログ出力
│   └── repositories/              # リポジトリ実装
│       ├── subagent-repository.ts
│       ├── team-repository.ts
│       └── plan-repository.ts
│
├── infrastructure/                # Layer 4: Frameworks & Drivers
│   ├── pi-sdk/                    # pi SDK関連
│   │   ├── api-client.ts
│   │   └── event-handlers.ts
│   ├── storage/                   # ストレージ実装
│   │   ├── json-storage.ts
│   │   ├── jsonl-storage.ts
│   │   └── file-lock.ts
│   ├── logging/                   # ログ実装
│   │   ├── comprehensive-logger.ts
│   │   └── logger-config.ts
│   └── external/                  # 外部サービス
│       ├── openai-client.ts
│       └── embeddings-provider.ts
│
└── extensions/                    # pi拡張機能エントリポイント
    ├── subagents.ts              # subagent_* ツール定義
    ├── agent-teams.ts            # agent_team_* ツール定義
    ├── loop.ts                   # loop_* ツール定義
    └── plan.ts                   # plan_* ツール定義
```

## 既存ファイルの移行マッピング

### Layer 1: Enterprise Business Rules (core/)

| 既存ファイル | 移行先 | 備考 |
|------------|--------|------|
| `lib/agent-types.ts` | `core/domain/agent.ts` | 型定義をドメインモデルに |
| `lib/team-types.ts` | `core/domain/team.ts` | 型定義をドメインモデルに |
| `lib/agent-common.ts` | `core/domain/` | 設定値を値オブジェクトに |
| `lib/validation-utils.ts` | `core/value-objects/` | バリデーションを値オブジェクトにカプセル化 |

### Layer 2: Application Business Rules (application/)

| 既存ファイル | 移行先 | 備考 |
|------------|--------|------|
| `extensions/subagents.ts` | `application/use-cases/subagent/` | ユースケースを抽出 |
| `extensions/agent-teams/*.ts` | `application/use-cases/team/` | ユースケースを抽出 |
| `extensions/loop.ts` | `application/use-cases/loop/` | ユースケースを抽出 |
| `extensions/plan.ts` | `application/use-cases/plan/` | ユースケースを抽出 |
| `lib/execution-rules.ts` | `application/` | 実行ルールをユースケースに |

### Layer 3: Interface Adapters (adapters/)

| 既存ファイル | 移行先 | 備考 |
|------------|--------|------|
| `lib/storage-*.ts` | `adapters/gateways/` | ストレージをゲートウェイに |
| `lib/comprehensive-logger*.ts` | `adapters/gateways/` | ログをゲートウェイに |
| `lib/live-*.ts` | `adapters/presenters/` | TUI表示をプレゼンターに |
| `lib/tui/` | `adapters/presenters/` | TUI関連をプレゼンターに |

### Layer 4: Frameworks & Drivers (infrastructure/)

| 既存ファイル | 移行先 | 備考 |
|------------|--------|------|
| `lib/provider-limits.ts` | `infrastructure/external/` | プロバイダー設定 |
| `lib/model-timeouts.ts` | `infrastructure/external/` | モデル設定 |
| `lib/embeddings/` | `infrastructure/external/` | 外部API |
| `lib/abort-utils.ts` | `infrastructure/` | 低レベルユーティリティ |

## 移行優先順位

### Phase 1: 基盤構築（2週間）

1. **core/domain/**: ドメインモデル定義
   - agent.ts, team.ts, task.ts, plan.ts

2. **core/value-objects/**: 値オブジェクト定義
   - run-id.ts, timeout.ts, rate-limit.ts

3. **application/ports/**: ポート（インターフェース）定義
   - llm-provider.ts, storage.ts, logger.ts

### Phase 2: ユースケース抽出（4週間）

1. **subagent**: 現在の`subagents.ts`からユースケースを抽出
2. **team**: 現在の`agent-teams/`からユースケースを抽出
3. **loop**: 現在の`loop.ts`からユースケースを抽出
4. **plan**: 現在の`plan.ts`からユースケースを抽出

### Phase 3: アダプター実装（3週間）

1. **gateways**: ストレージ、ログのゲートウェイ実装
2. **presenters**: TUI表示のプレゼンター実装
3. **repositories**: リポジトリ実装

### Phase 4: インフラ整備（1週間）

1. **infrastructure/**: 低レベルユーティリティの整理
2. **extensions/**: エントリポイントの簡素化

## 依存ルール

```
┌─────────────────────────────────────────────┐
│ extensions (エントリポイント)                 │
└─────────────────────┬───────────────────────┘
                      │ 依存
┌─────────────────────▼───────────────────────┐
│ adapters (Interface Adapters)               │
│  - controllers                              │
│  - presenters                               │
│  - gateways                                 │
│  - repositories                             │
└─────────────────────┬───────────────────────┘
                      │ 依存
┌─────────────────────▼───────────────────────┐
│ application (Application Business Rules)    │
│  - use-cases                                │
│  - ports                                    │
│  - dto                                      │
└─────────────────────┬───────────────────────┘
                      │ 依存
┌─────────────────────▼───────────────────────┐
│ core (Enterprise Business Rules)            │
│  - domain                                   │
│  - value-objects                            │
│  - services                                 │
└─────────────────────────────────────────────┘

infrastructure/ は adapters/ から依存される（プラグインとして）
```

## 新規ファイル作成時のガイドライン

### 1. ファイル配置の判断フロー

```
新しい機能を追加する場合:
↓
Q: ビジネスルールか？
  YES → core/domain/ または core/services/
  NO ↓
Q: アプリケーションロジックか？
  YES → application/use-cases/
  NO ↓
Q: 外部システムとの変換か？
  YES → adapters/
  NO ↓
Q: 技術的詳細か？
  YES → infrastructure/
  NO → extensions/ (エントリポイントのみ)
```

### 2. 依存関係の確認

```typescript
// OK: 内側への依存
import { Agent } from '../core/domain/agent';
import { RunSubagentUseCase } from '../application/use-cases/subagent';

// NG: 外側への依存（coreからadaptersへの依存）
import { SubagentRepository } from '../adapters/repositories';  // NG!
```

### 3. インターフェースの定義場所

```typescript
// application/ports/storage.ts (ポート定義)
export interface IStorage {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

// adapters/gateways/storage-gateway.ts (実装)
import { IStorage } from '../../application/ports/storage';
export class FileStorage implements IStorage { ... }
```

## トレードオフの認識

### 現在の開発フェーズ: 中盤

| 原則 | 重視度 | 理由 |
|------|--------|------|
| CCP | 中 | 仕様はある程度安定、変更局所化は重要 |
| REP | 中 | 再利用可能なコンポーネントが明確化 |
| CRP | 高 | 不要な依存を避ける（細粒度コンポーネント） |

### コンポーネント分割の指針

- **大きすぎるコンポーネント**: `self-improvement-loop.ts` (119KB) → 複数のユースケースに分割
- **小さすぎるコンポーネント**: ユーティリティは機能単位でグループ化

## 段階的移行の実践

### 既存ファイルの扱い

1. **新規機能**: 新しい構造で作成
2. **バグ修正**: 最小限の修正、移行は後で
3. **リファクタリング**: 移行のタイミングで実施

### 移行のトリガー

- 新機能追加時
- 大規模バグ修正時
- テスト追加時

### 移行の検証

```bash
# 依存関係の検証（循環依存チェック）
npx madge --circular .pi/

# 型チェック
npx tsc --noEmit

# テスト実行
npm test
```

## 参考

- [clean-architecture/SKILL.md](../skills/clean-architecture/SKILL.md)
- 『Clean Architecture 達人に学ぶソフトウェアの構造と設計』
