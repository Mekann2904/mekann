# verification-workflow.ts リファクタリング計画

## 現状分析

- **ファイル**: `.pi/lib/verification-workflow.ts`
- **行数**: 6,287行
- **問題**: 単一責任の原則違反、14種類の異なる関心事が混在

## 分割後のモジュール構成

```
.pi/lib/verification/
├── index.ts                      # 統合エクスポート
├── types.ts                      # 共通型定義
├── core.ts                       # コアワークフロー
├── config.ts                     # 設定管理
├── patterns/
│   ├── output-patterns.ts        # 出力パターン検出
│   ├── bug-hunting-aporia.ts     # バグハンティング・アポリア
│   ├── utopia-dystopia.ts        # ユートピア/ディストピア分析
│   └── schizo-analysis.ts        # スキゾ分析
├── analysis/
│   ├── metacognitive-check.ts    # メタ認知チェック
│   ├── inference-chain.ts        # 推論チェーン解析
│   ├── thinking-mode.ts          # 思考モード分析
│   └── dystopian-risk.ts         # ディストピアリスク評価
├── generation/
│   ├── prompts.ts                # プロンプト生成
│   └── improvement-actions.ts    # 改善アクション生成
├── extraction/
│   ├── candidates.ts             # 候補抽出・フィルタリング
│   └── integrated-detection.ts   # 統合検出
└── assessment/
    └── uncertainty.ts            # 不確実性評価
```

## 各モジュールの責務

### Core Layer (内側)

| モジュール | 責務 | 依存 |
|-----------|------|------|
| `types.ts` | 共通型定義 | なし |
| `config.ts` | 設定の読み込み・解決 | types |
| `core.ts` | 検証トリガー判定、結果統合 | types, config |

### Domain Layer (パターン検出)

| モジュール | 責務 | 行数 |
|-----------|------|------|
| `output-patterns.ts` | CLAIM-RESULT不一致、過信、バイアス検出 | ~530 |
| `bug-hunting-aporia.ts` | 速度・完全性、仮説・証拠、深さ・幅 | ~350 |
| `utopia-dystopia.ts` | 機械化、人間排除、コンテキスト盲目 | ~360 |
| `schizo-analysis.ts` | 欲望パターン、内的ファシズム | ~410 |

### Analysis Layer

| モジュール | 責務 | 行数 |
|-----------|------|------|
| `metacognitive-check.ts` | メタ認知、アポリア、論証 | ~1250 |
| `inference-chain.ts` | 推論チェーンのパース | ~200 |
| `thinking-mode.ts` | 6帽子、System1/2、ブルーム | ~500 |
| `dystopian-risk.ts` | リスク評価、解放可能性 | ~620 |

### Generation Layer

| モジュール | 責務 | 行数 |
|-----------|------|------|
| `prompts.ts` | Inspector/Challengerプロンプト | ~200 |
| `improvement-actions.ts` | アクション生成 | ~350 |

### Extraction Layer

| モジュール | 責務 | 行数 |
|-----------|------|------|
| `candidates.ts` | 候補抽出、コンテキストフィルタ | ~400 |
| `integrated-detection.ts` | 統合検出実行 | ~300 |

### Assessment Layer

| モジュール | 責務 | 行数 |
|-----------|------|------|
| `uncertainty.ts` | 不確実性評価、限界特定 | ~560 |

## 依存関係の方向

```
extraction → analysis → patterns → core → types
generation → analysis → patterns → core → types
assessment → analysis → patterns → core → types
```

**ルール**: 外側のレイヤーは内側のレイヤーにのみ依存する

## 実装順序

1. **Phase 1**: 基盤構築 ✅
   - [x] `types.ts` - 共通型定義 (20.6KB)
   - [x] `config.ts` - 設定管理 (6.5KB)
   - [x] `index.ts` - エクスポート統合 (3.9KB)

2. **Phase 2**: パターン検出 ✅
   - [x] `patterns/output-patterns.ts` (12.3KB)
   - [x] `patterns/bug-hunting-aporia.ts` (18.8KB)
   - [x] `patterns/utopia-dystopia.ts` (10.3KB)
   - [x] `patterns/schizo-analysis.ts` (10.7KB)
   - [x] `patterns/index.ts` (1.8KB)

3. **Phase 3**: 分析機能
   - [ ] `analysis/metacognitive-check.ts`
   - [ ] `analysis/inference-chain.ts`
   - [ ] `analysis/thinking-mode.ts`
   - [ ] `analysis/dystopian-risk.ts`

4. **Phase 4**: 生成・抽出
   - [ ] `generation/prompts.ts`
   - [ ] `generation/improvement-actions.ts`
   - [ ] `extraction/candidates.ts`
   - [ ] `extraction/integrated-detection.ts`

5. **Phase 5**: 評価・統合
   - [ ] `assessment/uncertainty.ts`
   - [ ] `core.ts` - コアワークフロー
   - [ ] 元ファイルの削除とインポート更新

## 互換性維持

元の `.pi/lib/verification-workflow.ts` は以下のように変更：

```typescript
// 既存コードへの互換性維持
export * from './verification/index.js';
```

## テスト戦略

各モジュールに対応するテストファイルを作成：
- `tests/unit/lib/verification/*.test.ts`
