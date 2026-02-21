---
title: テスト戦略
category: development
audience: developer
last_updated: 2025-02-21
tags: [testing, vitest, test-engineering, coverage]
related: [../getting-started/contributing.md, SKILL.md]
---

# テスト戦略

## 現状の概要

### テストカバレッジ

| 指標 | 値 | 評価 |
|------|-----|------|
| テストファイル数 | 134個 | 充実 |
| テストケース数 | 4947個 | 充実 |
| テスト成功率 | 99.5% (4921/4947) | 優秀 |
| テストランナー | Vitest | 適切 |
| プロパティベーステスト | fast-check使用済み | 優秀 |
| カバレッジ | 分析中 | 未測定 |

### 主要なテスト対象

#### ライブラリ（.pi/lib/）
- `cross-instance-coordinator.test.ts` - インスタンス間調整機能
- `context-engineering.test.ts` - コンテキストエンジニアリング
- `task-scheduler.test.ts` - タスクスケジューラ
- `adaptive-rate-controller.test.ts` - 適応的レート制御
- `metrics-collector.test.ts` - メトリクス収集
- `checkpoint-manager.test.ts` - チェックポイント管理
- `retry-with-backoff.test.ts` - リトライ戦略
- `verification-workflow.test.ts` - 検証ワークフロー
- `agent.test.ts` - エージェントコア
- `agent-errors.test.ts` - エージェントエラー処理

#### 拡張機能（.pi/extensions/）
- `agent-runtime.test.ts` - エージェントランタイム
- `subagents.test.ts` - サブエージェント機能
- `plan.test.ts` - プランニング拡張
- `dynamic-tools.test.ts` - 動的ツール
- `usage-tracker.test.ts` - 使用状況追跡
- `invariant-pipeline.test.ts` - 不変量パイプライン
- `agent-teams/extension.test.ts` - エージェントチーム
- `search/tools/*.test.ts` - 検索ツール群

### テストピラミッドの構成

```
        ┌─────────────────┐
        │   E2Eテスト      │  12テスト（1ファイル）
        │   (question,    │  13テスト（1ファイル）
        │    plan,        │  3テスト（1ファイル）
        │    subagents)   │  1テスト（1ファイル）
        ├─────────────────┤
        │  統合・契約テスト  │  10+ テスト
        │  (extension-    │
        │   integration)  │
        ├─────────────────┤
        │   単体テスト      │  4900+ テスト（130+ファイル）
        └─────────────────┘
```

## 失敗テストの分類と対応

### P0: importパスエラー（解決済み）
**対象:** 5ファイル
- `call_graph.test.ts`
- `code_search.test.ts`
- `file_candidates.test.ts`
- `semantic_search.test.ts`
- `sym_find.test.ts`

**原因:** 相対パスが1レベル不足
**解決:** エイリアス`@ext`/`@lib`を使用するよう修正
**ステータス:** 修正完了、モック設定問題が残存

### P1: モック設定不備
**対象:** 40+ テスト
**原因:**
- `cross-instance-coordinator`の不完全なモック定義
- `isCoordinatorInitialized`等のエクスポートが定義されていない
- search/toolsの動的importにおけるモック不足

**対応:**
1. `tests/setup-vitest.ts`にデフォルトモックを追加
2. または、問題のあるテストファイルで個別にモックを定義

### P2: E2Eテスト失敗
**対象:** 12テスト
**原因:** `uiNotify`スパイが呼び出されていない
**調査が必要:**
- E2Eテストのシナリオ定義を確認
- 拡張機能の実装を確認
- テストの期待値が正しいか検証

### P3: MBTテスト失敗
**対象:** 1テスト
**ファイル:** `state-machine.mbt.test.ts`
**原因:** プロパティベーステストの設定問題

## 未テストモジュールの優先順位評価

### 優先度: 高
| モジュール | 理由 |
|-----------|------|
| `embeddings/*` | 新機能、外部API連携 |
| `cross-instance-runtime.ts` | インスタンス間連携の重要機能 |

### 優先度: 中
| モジュール | 理由 |
|-----------|------|
| `subagents/storage.ts` | データ永続化 |
| `subagents/parallel-execution.ts` | 並列実行ロジック |
| `subagents/task-execution.ts` | タスク実行エンジン |
| `subagents/live-monitor.ts` | ライブ監視機能 |
| `code-structure-analyzer/*` | コード解析機能 |

### 優先度: 低
| モジュール | 理由 |
|-----------|------|
| `tui/*` | UI層、統合テストで十分な場合あり |
| `dynamic-tools/types.ts` | 型定義のみ |
| `dynamic-tools/reflection.ts` | ユーティリティ機能 |
| `dynamic-tools/registry.ts` | 単純な登録機能 |
| `dynamic-tools/audit.ts` | 監査機能 |

## テスト戦略のガイドライン

### AAA構造
すべての単体テストは以下の構造に従う:

```typescript
// Arrange（準備）
テストデータを設定
モックの振る舞いを定義

// Act（実行）
テスト対象メソッドを呼び出し

// Assert（確認）
期待する結果を検証
```

### モック/スタブの使用
- **フェイク優先:** 実際の動作をシミュレートするフェイク実装を優先
- **モックは最小限:** 呼び出し検証が必要な場合のみ使用
- **所有していない型のモック禁止:** サードパーティライブラリは直接モック化せず、ラッパーを経由

### テストダブルの選択優先順位
```
1. 実際の実装（忠実度最高）
2. フェイク（忠実度高、コスト中）
3. モック（忠実度低、使用は最小限）
```

### テストカバレッジ目標
| カバレッジ率 | 目標 |
|-------------|------|
| 新規コード | 90%以上 |
| 既存コード（主要機能） | 75%以上 |
| 既存コード（ユーティリティ） | 60%以上 |

### プロパティベーステスト
以下の条件で導入:
- 複雑なビジネスロジック
- 多くのエッジケースがある
- 例示ベーステストでは不十分
- `fast-check`を利用

## テスト実行環境

### コマンド
```bash
# 全テスト実行
npm test

# 特定ファイル実行
npm test -- tests/unit/lib/agent.test.ts

# カバレッジ計測
npm run test:coverage

# ウォッチモード
npm run test:watch

# 単体テストのみ
npm run test:unit
```

### Vitest設定
- シングルスレッド実行（メモリ節約）
- 並列ファイル実行無効
- グローバルAPI有効化

## 品質チェックリスト

### テスト作成時
- [ ] AAA構造を守っている
- [ ] テスト名が`[メソッド名]_[シナリオ条件]_[期待動作]`形式
- [ ] マジックストリング/ナンバーを避けている
- [ ] テスト内ロジック（if/for/while）を避けている
- [ ] Setup/Teardownよりヘルパーメソッド優先
- [ ] 単一Actタスク
- [ ] プライベートメソッドは公開メソッド経由で検証

### プロパティベーステスト時
- [ ] 明確な不変条件を定義
- [ ] 適切なArbitraryを定義
- [ ] シュリンク機能が有効
- [ ] ランダムシード固定可能

### モック使用時
- [ ] フェイク使用可能か検討済み
- [ ] モックの目的が明確
- [ ] 最低限のインターフェースのみモック
- [ ] 所有していない型をモックしていない

## 今後の計画

### 短期（1-2週間）
1. [ ] 失敗テストの修正（P0〜P2）
2. [ ] `cross-instance-coordinator`のモック問題解決
3. [ ] E2Eテストの調査と修正
4. [ ] カバレッジ測定と分析

### 中期（1ヶ月）
1. [ ] 未テストモジュールのテスト追加（優先度高〜中）
2. [ ] プロパティベーステストの拡充
3. [ ] テストドキュメントの整備
4. [ ] CI/CDパイプラインへのカバレッジチェック組み込み

### 長期（2-3ヶ月）
1. [ ] カバレッジ目標達成（新規90%以上、既存75%以上）
2. [ ] モデルベーステストの導入検討
3. [ ] テスト実行時間の最適化
4. [ ] 変異テスト（Mutation Testing）の導入検討

## 関連ドキュメント

- [Test Engineeringスキル](../../.pi/skills/test-engineering/SKILL.md)
- [Vitestドキュメント](https://vitest.dev/)
- [fast-checkドキュメント](https://fast-check.dev/)
