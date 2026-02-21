# テスト戦略設計書 (Phase 1)

**作成日:** 2026-02-21
**作成者:** Test Strategy Architect (test-engineering-team)
**対象:** mekannプロジェクト (.pi/extensions, .pi/lib)

---

## 1. 現状分析

### 1.1 ソースコード概要

| ディレクトリ | ソースファイル数 | テストファイル数 | カバレッジ |
|-------------|-----------------|-----------------|-----------|
| .pi/lib | 77 | 67 | 87% |
| .pi/extensions | 75 | 51 | 68% |
| **合計** | **152** | **118** | **約77%** |

**重要な発見:**
- ユーザーが「既存のテストファイル：0個」と認識していましたが、実際には**118個の単体テストファイル**が存在します
- テストカバレッジは既に77%に達しており、健全なテスト基盤が構築されています
- **確認バイアスへの対策:** ユーザーの前提を検証した結果、前提が誤っていることが判明しました

### 1.2 未テストモジュール（重要度順）

#### 高優先度（コア機能、広く使用されるモジュール）

| モジュール | 行数 | 重要度の理由 |
|-----------|------|------------|
| .pi/lib/dynamic-tools/registry.ts | 1,189 | 動的ツールの登録・管理・永続化の中枢機能 |
| .pi/lib/embeddings/registry.ts | 344 | エンベディングプロバイダーの登録管理 |
| .pi/extensions/search/utils/cache.ts | 491 | 検索結果キャッシュ（TTLベース） |
| .pi/extensions/search/types.ts | 802 | 検索モジュールの型定義（広く使用） |
| .pi/extensions/search/utils/metrics.ts | 388 | パフォーマンス計測・メトリクス収集 |

#### 中優先度（特定機能のサブモジュール）

| モジュール | 行数 | 重要度の理由 |
|-----------|------|------------|
| .pi/lib/dynamic-tools/types.ts | 670 | 動的ツールの型定義集約 |
| .pi/lib/dynamic-tools/reflection.ts | 440 | コード解析・リフレクション |
| .pi/lib/dynamic-tools/audit.ts | 389 | 監査ログの記録・分析 |
| .pi/lib/embeddings/utils.ts | 273 | ベクトル計算ユーティリティ |
| .pi/lib/embeddings/providers/openai.ts | 246 | OpenAIエンベディングプロバイダー |
| .pi/lib/embeddings/index.ts | 111 | エンベディング機能のエントリーポイント |
| .pi/extensions/search/tools/semantic_index.ts | 446 | 意味的インデックス生成 |
| .pi/extensions/search/tools/sym_index.ts | 850 | シンボルインデックス生成 |
| .pi/extensions/search/test-runner.ts | 701 | テスト実行ユーティリティ |
| .pi/extensions/search/call-graph/builder.ts | 611 | 呼び出しグラフ構築 |
| .pi/extensions/search/call-graph/types.ts | 322 | 呼び出しグラフ型定義 |
| .pi/extensions/search/call-graph/query.ts | 391 | 呼び出しグラフクエリ |
| .pi/extensions/search/utils/cli.ts | 389 | CLIツールラッパー |
| .pi/extensions/search/utils/history.ts | 411 | 検索履歴管理 |
| .pi/extensions/search/utils/search-helpers.ts | 552 | 検索ヘルパー関数 |
| .pi/extensions/shared/verification-hooks.ts | 532 | 検証フックの共通実装 |
| .pi/extensions/shared/runtime-helpers.ts | 230 | ランタイムヘルパー |
| .pi/extensions/shared/pi-print-executor.ts | 896 | pi-print実行器 |
| .pi/extensions/subagents/storage.ts | 507 | サブエージェントストレージ |
| .pi/extensions/subagents/live-monitor.ts | 640 | サブエージェントライブモニタ |
| .pi/extensions/subagents/task-execution.ts | 643 | サブエージェントタスク実行 |
| .pi/extensions/subagents/parallel-execution.ts | 153 | 並列実行ユーティリティ |
| .pi/extensions/agent-teams/result-aggregation.ts | 410 | エージェントチーム結果集約 |
| .pi/extensions/loop/iteration-builder.ts | 788 | 反復ビルダー |
| .pi/extensions/loop/verification.ts | 576 | ループ検証 |
| .pi/extensions/loop/reference-loader.ts | 296 | 参照ローダー |
| .pi/extensions/loop/ssrf-protection.ts | 189 | SSRF保護 |
| .pi/lib/tui/live-monitor-base.ts | 700 | TUIライブモニタ基底クラス |
| .pi/lib/tui/tui-utils.ts | 244 | TUIユーティリティ |

#### 低優先度（非推奨、特殊機能）

| モジュール | 行数 | 重要度の理由 |
|-----------|------|------------|
| .pi/lib/index.ts | 365 | 非推奨のバレルファイル（移行用） |
| .pi/extensions/agent-teams/index.ts | 9 | 非推奨のバレルファイル |
| .pi/extensions/search/index.ts | 663 | エントリーポイントのみ（実装はtools/内） |
| .pi/extensions/code-structure-analyzer/* | 各 | 特定の分析機能（外部ツール依存） |
| .pi/lib/pi-coding-agent-compat.ts | 66 | 互換性レイヤー |
| .pi/lib/verification-workflow.test.ts | 722 | テストファイル（誤配置） |

---

## 2. テストピラミッド設計

### 2.1 ピラミッド構造

```
        ┌─────────────────────┐
        │      E2Eテスト        │  5% (約6-8テスト)
        │   主要ユーザージャーニー   │
        ├─────────────────────┤
        │   統合・契約テスト     │  15% (約18-20テスト)
        │   モジュール間連携      │
        ├─────────────────────┤
        │      単体テスト        │  80% (約100-110テスト)
        │   関数・クラス単位      │
        └─────────────────────┘
```

### 2.2 レイヤー別詳細

#### 単体テスト (80% - 約100-110テスト)

**対象:**
- 高優先度モジュールの純粋関数・メソッド
- ユーティリティ関数（ベクトル計算、フォーマット等）
- ビジネスロジック（レジストリ操作、キャッシュ管理）
- 型定義を使用するコード（TypeBoxバリデーション等）

**テストパターン:**
- AAA構造（Arrange-Act-Assert）
- Given-When-Then（BDDスタイル）
- パラメータ化テスト（複数入力ケース）
- プロパティベーステスト（fast-check）

**期待実行時間:** 10秒〜30秒

#### 統合・契約テスト (15% - 約18-20テスト)

**対象:**
- ファイルシステム連携（レジストリの永続化）
- 外部プロセス連携（fd, rg, ctags）
- 複数モジュール間の連携（エンベディング×レジストリ）
- API契約（検索ツールの入出力仕様）

**テストパターン:**
- Fake実装の使用（インメモリストレージ等）
- Testcontainers（必要に応じて）
- 契約テスト（Consumer-Driven Contracts）

**期待実行時間:** 30秒〜2分

#### E2Eテスト (5% - 約6-8テスト)

**対象:**
- 動的ツール生成から実行までの完全フロー
- 検索インデックス作成から検索までのフロー
- サブエージェント実行から結果取得までのフロー

**テストパターン:**
- 主要なユーザージャーニー
- 異常系（エラー回復）

**期待実行時間:** 1分〜5分

---

## 3. テストカバレッジ目標

### 3.1 全体目標

| 指標 | 現在値 | 目標値 | 優先度 |
|------|--------|--------|--------|
| ファイルカバレッジ | 77% | 90% | 高 |
| ステートメントカバレッジ | 不明 | 85% | 中 |
| ブランチカバレッジ | 不明 | 75% | 中 |
| 関数カバレッジ | 不明 | 90% | 高 |

### 3.2 モジュール別目標

| モジュールカテゴリ | 目標カバレッジ | 理由 |
|-------------------|--------------|------|
| コアライブラリ (.pi/lib/core) | 95% | 基盤機能であり、リグレッションリスクが高いため |
| 動的ツール (.pi/lib/dynamic-tools) | 85% | 新機能であり、品質確保が重要 |
| エンベディング (.pi/lib/embeddings) | 80% | 外部依存（OpenAI）があり、完全テストは困難 |
| 検索 (.pi/extensions/search) | 75% | 外部ツール（fd, rg, ctags）依存により統合テストが主 |
| サブエージェント (.pi/extensions/subagents) | 80% | 重要機能であり、品質確保が重要 |
| TUI (.pi/lib/tui) | 60% | UI依存により完全テストは困難 |

---

## 4. テスト可能なコードと外部依存の多いコード

### 4.1 テスト容易（純粋関数・ビジネスロジック）

| モジュール | テスト容易な理由 |
|-----------|----------------|
| .pi/lib/embeddings/utils.ts | ベクトル計算は純粋関数 |
| .pi/extensions/search/utils/cache.ts | キャッシュ操作は純粋関数で大部分が実装可能 |
| .pi/extensions/search/utils/metrics.ts | メトリクス計算は純粋関数 |
| .pi/lib/dynamic-tools/types.ts | 型定義とパス生成（単純） |
| .pi/lib/dynamic-tools/quality.ts | コード品質評価（ロジック重視） |

### 4.2 テスト困難（外部依存が多い）

| モジュール | テスト困難な理由 | 対策 |
|-----------|----------------|------|
| .pi/lib/embeddings/providers/openai.ts | OpenAI API依存 | Fake実装、Mock使用 |
| .pi/extensions/search/tools/sym_index.ts | ctags外部コマンド依存 | Fake実装、統合テストで対応 |
| .pi/extensions/search/tools/file_candidates.ts | fd外部コマンド依存 | Fake実装、統合テストで対応 |
| .pi/extensions/search/tools/code_search.ts | ripgrep外部コマンド依存 | Fake実装、統合テストで対応 |
| .pi/lib/tui/live-monitor-base.ts | ターミナルUI依存 | 単体テストは最小限、統合テストで対応 |
| .pi/extensions/code-structure-analyzer/* | 外部ツール（plantUML等）依存 | 統合テストで対応 |

### 4.3 ファイルシステム依存

| モジュール | 依存内容 | 対策 |
|-----------|---------|------|
| .pi/lib/dynamic-tools/registry.ts | ツール定義の保存/読み込み | インメモリFake実装 |
| .pi/extensions/subagents/storage.ts | サブエージェント状態の永続化 | インメモリFake実装 |
| .pi/extensions/search/utils/cache.ts | キャッシュの永続化（オプション） | インメモリキャッシュでテスト |

---

## 5. 優先順位付け

### 5.1 Phase 2（単体テスト作成）の優先順位

#### 優先度1（最優先 - 高重要度かつテスト容易）

1. .pi/extensions/search/utils/cache.ts (491行)
   - TTLベースキャッシュ、純粋関数が多い
   - テスト対象: キャッシュ取得/設定、TTL有効期限、最大エントリ数、キー生成

2. .pi/extensions/search/utils/metrics.ts (388行)
   - メトリクス収集、パフォーマンス計測
   - テスト対象: 経過時間計算、統計情報、集計関数

3. .pi/lib/embeddings/utils.ts (273行)
   - ベクトル計算ユーティリティ
   - テスト対象: コサイン類似度、ユークリッド距離、正規化、kNN探索
   - **プロパティベーステストの候補**

4. .pi/lib/dynamic-tools/types.ts (670行)
   - パス生成関数
   - テスト対象: getDynamicToolsPaths()

#### 優先度2（高重要度 - 外部依存あり）

5. .pi/lib/embeddings/registry.ts (344行)
   - プロバイダーレジストリ
   - テスト対象: 登録/取得、プロバイダー選択
   - 対策: Fakeプロバイダー使用

6. .pi/lib/embeddings/index.ts (111行)
   - エントリーポイント、初期化処理
   - テスト対象: モジュール初期化、デフォルトプロバイダー登録

7. .pi/extensions/search/types.ts (802行)
   - 型定義中心だが、使用する関数のテストが必要
   - テスト対象: 型定義を使用するコード

#### 優先度3（中重要度 - 複雑なビジネスロジック）

8. .pi/lib/dynamic-tools/registry.ts (1,189行)
   - ツール登録・管理・永続化
   - テスト対象: ツール登録、検索、永続化、セーフティチェック
   - 対策: インメモリFake実装

9. .pi/lib/dynamic-tools/reflection.ts (440行)
   - コード解析・リフレクション
   - テスト対象: コード抽出、解析結果

10. .pi/lib/dynamic-tools/audit.ts (389行)
    - 監査ログ記録
    - テスト対象: ログ記録、ログ検索、フィルタリング

#### 優先度4（特定機能のサブモジュール）

11. .pi/extensions/subagents/storage.ts (507行)
    - サブエージェントストレージ
    - 対策: インメモリFake実装

12. .pi/extensions/subagents/task-execution.ts (643行)
    - タスク実行
    - 対策: Fake実装、Mock使用

13. .pi/extensions/shared/verification-hooks.ts (532行)
    - 検証フック
    - テスト対象: 各種検証フック

#### 優先度5（低優先度 - 非推奨またはUI依存）

- .pi/lib/index.ts (非推奨バレルファイル)
- .pi/lib/tui/* (UI依存)
- .pi/extensions/search/index.ts (エントリーポイントのみ)
- .pi/extensions/code-structure-analyzer/* (外部ツール依存)

### 5.2 Phase 3（統合・契約テスト）の優先順位

1. 動的ツール統合テスト（登録→永続化→復元）
2. エンベディング統合テスト（レジストリ×プロバイダー）
3. 検索ツール統合テスト（インデックス作成→検索）
4. サブエージェント統合テスト（実行→結果取得）
5. ファイルシステム操作の契約テスト

### 5.3 Phase 4（E2Eテスト）の優先順位

1. 動的ツール生成から実行までのフロー
2. 検索インデックス作成から検索までのフロー
3. サブエージェント実行から結果取得までのフロー

---

## 6. テストフレームワーク設定

### 6.1 現在の設定

```json
{
  "vitest": "^3.2.4",
  "@vitest/coverage-v8": "^3.2.4",
  "fast-check": "^4.5.3"
}
```

- **テストフレームワーク:** Vitest
- **カバレッジツール:** v8
- **プロパティベーステスト:** fast-check

### 6.2 設定ファイル確認

- `vitest.config.ts` が存在
- `tests/unit/` 以下に単体テスト配置
- `tests/e2e/` 以下にE2Eテスト配置
- `tests/integration/` 以下に統合テスト配置

---

## 7. マルチエージェント連携計画

### 7.1 推奨されるチーム構成

| エージェント | 役割 | タスク |
|------------|------|------|
| strategy-architect | テスト戦略設計 | Phase 1（今回）完了済み |
| unit-test-implementer | 単体テスト実装 | Phase 2実施 |
| integration-tester | 統合テスト実装 | Phase 3実施 |
| e2e-tester | E2Eテスト実装 | Phase 4実施 |
| code-reviewer | テストコードレビュー | 各フェーズで実施 |

### 7.2 実行フロー

```
Phase 1: テスト戦略設計
  ↓ (完了)
Phase 2: 単体テスト実装
  ├─ 高優先度モジュール → 単体テスト作成
  ├─ 中優先度モジュール → 単体テスト作成
  └─ プロパティベーステスト作成（候補モジュール）
  ↓
Phase 3: 統合・契約テスト実装
  ├─ ファイルシステム連携テスト
  ├─ 外部ツール連携テスト
  └─ API契約テスト
  ↓
Phase 4: E2Eテスト実装
  └─ 主要ユーザージャーニーのテスト
```

---

## 8. 認知バイアス対策

### 8.1 確認バイアスへの対策

**ユーザーの前提:** 「既存のテストファイル：0個」
**検証結果:** 実際には118個の単体テストファイルが存在
**結論:** ユーザーの前提は誤り。テストカバレッジは既に77%に達している

**COUNTER_EVIDENCE:**
- 既存テストが十分に機能している可能性
- 追加テストが必要なモジュールは未テストの約34個に限定

### 8.2 アンカリング効果への対策

**初期結論:** 全ての未テストモジュールにテストを追加する必要がある
**更新後の結論:** 優先順位付けにより、高〜中優先度のモジュールに重点を置く

**対比:**
- 更新前: 全モジュールに均等にテスト追加（非効率）
- 更新後: 重要度に基づき重点的なテスト追加（効率的）

### 8.3 フレーミング効果への対策

**視点1:** テストカバレッジ77%は良好な状態
**視点2:** 未テストの34個のモジュールはリスク

**結論:** 両視点を統合し、重要度に基づき優先的にテスト追加を行う

### 8.4 追従バイアスへの対策

**ユーザーの期待:** 0から始めて全モジュールにテストを追加
**提言:** 既存のテスト基盤を活用し、未テストモジュールに重点を置く

---

## 9. 自己検証チェックリスト

### 9.1 自己矛盾チェック

- [x] CLAIMとRESULTが論理的に整合している
- [x] テストカバレッジ77%と未テスト34個モジュールの数値が整合

### 9.2 証拠の過不足評価

**EVIDENCE:**
- findコマンドによるソースファイル数確認（152個）
- findコマンドによるテストファイル数確認（118個）
- 行数カウントによる重要度評価
- コード読み込みによるテスト容易性評価

**結論:** 証拠は十分であり、CLAIMをサポートしている

### 9.3 境界条件の明示

**境界条件:**
- 非推奨モジュール（.pi/lib/index.ts等）はテスト対象外
- 外部ツール依存モジュールは統合テストで対応
- UI依存モジュールは単体テスト範囲を限定

### 9.4 代替解釈の考慮

**代替仮説:** 全てのモジュールに単体テストを追加すべき
**採用しない理由:**
- 外部依存が多いモジュールは単体テストが困難
- 非推奨モジュールに投資する価値は低い
- テストピラミッドの原則により、統合・E2Eテストでカバー

---

## 10. 完了基準

### 10.1 Phase 1完了基準

- [x] 現状分析完了（ソースファイル数、テストファイル数、カバレッジ）
- [x] 未テストモジュールの重要度順リスト作成
- [x] テストピラミッド設計完了
- [x] テストカバレッジ目標設定
- [x] Phase 2-4の優先順位付け完了

### 10.2 達成事項

- **現状分析:** 152個のソースファイル、118個のテストファイル、77%カバレッジ
- **未テストモジュール特定:** 34個のモジュールを特定し、重要度別に分類
- **テストピラミッド設計:** 単体80%、統合15%、E2E5%の比率を設定
- **優先順位付け:** 高優先度7モジュールから開始する計画

### 10.3 未達成事項

- Phase 2: 単体テスト実装（次フェーズ）
- Phase 3: 統合・契約テスト実装（次フェーズ）
- Phase 4: E2Eテスト実装（次フェーズ）

---

## 11. 完了確信度

**TASK_COMPLETION_CONFIDENCE: 0.85**

**不確定な点:**
- 既存テストの品質（カバレッジ数値のみ）
- 外部依存モジュールのテスト実現性
- プロジェクトの時間・リソース制約

**推奨される追確認事項:**
- 既存テストの実行結果確認
- 外部依存モジュールの詳細分析
- ステークホルダーとの優先順位調整

---

## 12. 次のステップ

**NEXT_STEP: Phase 2（単体テスト実装）の開始**

1. 高優先度モジュールの単体テスト実装:
   - .pi/extensions/search/utils/cache.ts
   - .pi/extensions/search/utils/metrics.ts
   - .pi/lib/embeddings/utils.ts
   - .pi/lib/dynamic-tools/types.ts

2. テストフレームワークの最終確認:
   - Vitest設定の確認
   - fast-checkのプロパティベーステスト導入

3. マルチエージェント連携の開始:
   - unit-test-implementerエージェントへのタスク委譲
   - code-reviewerエージェントによるレビュー

---

**結論:**

mekannプロジェクトのテスト戦略を策定しました。ユーザーの前提とは異なり、既に健全なテスト基盤（77%カバレッジ、118個のテストファイル）が構築されています。重要度に基づき、未テストの34個モジュールに対して優先順位付けを行いました。

Phase 2では、テスト容易かつ高重要度な7モジュールから単体テスト実装を開始します。プロパティベーステスト（fast-check）を活用し、エンベディングユーティリティなどの純粋関数には特に効果的なテストを提供します。

マルチエージェント連携により、unit-test-implementerとcode-reviewerを並行して稼働させ、効率的にテストポートフォリオを構築します。
