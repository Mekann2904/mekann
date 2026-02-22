# EDAレポート: 自己改善ループモード設計

**生成日時**: 2026-02-22T20:53:00+09:00

## エグゼクティブサマリー

既存のloop.ts（タスク完了型）をベースに、self-improvementスキルの7つの哲学的視座を循環させる「終わりなき自己改善ループモード」の実装は、構造的に拡張可能である。主要な変更点は以下の通り:

1. **状態管理の再設計**: 単一のstatus（continue/done）から、7つの視座の状態を持つ多次元状態へ
2. **停止機構の追加**: ユーザー明示的停止 + 安全停止（現在のタスク完了後）
3. **Git統合**: 各サイクル終了時にコミット
4. **作業ログ**: 自己改善ループ専用のログフォーマット

---

## 基本情報

### 対象ファイル

| ファイル | 行数 | 役割 |
|---------|------|------|
| `.pi/extensions/loop.ts` | 1764 | ループ実行機能の中核 |
| `.pi/extensions/loop/iteration-builder.ts` | 578 | プロンプト生成・契約パース |
| `.pi/lib/semantic-repetition.ts` | 472 | 意味的重複検出 |
| `.pi/skills/self-improvement/SKILL.md` | 1786 | 7つの哲学的視座の定義 |

### loop.tsの構造分析

#### 現在の状態モデル

```typescript
type LoopStatus = "continue" | "done" | "unknown";
type LoopGoalStatus = "met" | "not_met" | "unknown";
type StopReason = "model_done" | "max_iterations" | "stagnation" | "iteration_error";
```

#### 設定パラメータ

```typescript
interface LoopConfig {
  maxIterations: number;
  timeoutMs: number;
  requireCitation: boolean;
  verificationTimeoutMs: number;
  enableSemanticStagnation?: boolean;
  semanticRepetitionThreshold?: number;
  enableMediator?: boolean;
  mediatorAutoProceedThreshold?: number;
}
```

#### ログ出力構造

```
.pi/agent-loop/
├── <run-id>.jsonl           # イテレーションログ
├── <run-id>.summary.json    # 実行サマリー
└── latest-summary.json      # 最新サマリーのスナップショット
```

---

## データ構造分析

### 1. 状態遷移パターン

**現在のloop.ts**:
```
run_start
  ↓
mediator_phase (optional)
  ↓
iteration_start → iteration_done (繰り返し)
  ↓
run_done (stopReason: model_done | max_iterations | stagnation | iteration_error)
```

**自己改善ループモード（提案）**:
```
run_start
  ↓
[視座サイクル]
  ├─ I. 脱構築フェーズ
  ├─ II. スキゾ分析フェーズ
  ├─ III. 幸福論フェーズ
  ├─ IV. ユートピア/ディストピアフェーズ
  ├─ V. 思考哲学フェーズ
  ├─ VI. 思考分類学フェーズ
  └─ VII. 論理学フェーズ
  ↓
git_commit (各サイクル終了時)
  ↓
[停止チェック]
  ├─ ユーザー停止要求あり → 現在のタスク完了後 → 安全停止
  └─ なし → 次のサイクルへ
```

### 2. 7つの視座のデータ構造（提案）

```typescript
interface PerspectiveState {
  name: "deconstruction" | "schizoanalysis" | "eudaimonia" | 
        "utopia_dystopia" | "thinking_philosophy" | "thinking_taxonomy" | "logic";
  completed: boolean;
  findings: string[];
  nextQuestions: string[];
  timestamp: string;
}

interface SelfImprovementLoopState {
  cycleCount: number;
  currentPerspective: number; // 0-6 (7つの視座)
  perspectiveStates: PerspectiveState[];
  overallProgress: "exploring" | "deepening" | "integrating" | "paused" | "stopped";
  stopRequested: boolean;
  lastCommitHash: string;
  startedAt: string;
  lastUpdatedAt: string;
}
```

---

## 統計サマリー

### loop.tsの構造メトリクス

| メトリクス | 値 | 説明 |
|-----------|-----|------|
| 総行数 | 1764 | 中規模モジュール |
| インターフェース数 | 12 | 型定義の充実 |
| 関数数 | 25+ | 機能の細分化 |
| 外部依存 | 15+ | モジュール化が進んでいる |
| 設定パラメータ | 8 | 拡張性が高い |

### 拡張ポイントの特定

| 拡張箇所 | 必要な変更 | 影響範囲 |
|---------|-----------|---------|
| LoopConfig | 7視座関連設定の追加 | 小 |
| LoopStatus | 多次元状態への拡張 | 中 |
| runLoop() | 視座サイクルの統合 | 大 |
| buildIterationPrompt() | 視座別プロンプト生成 | 中 |
| ログ構造 | 視座状態の記録 | 小 |

---

## 品質評価

### 既存loop.tsの品質

| 側面 | 評価 | 根拠 |
|------|------|------|
| モジュール化 | 高 | SSRF保護、検証、参照読み込みが分離 |
| エラーハンドリング | 高 | 段階的再試行、タイムアウト処理 |
| 拡張性 | 高 | Mediator、SemanticStagnation等のオプトイン機能 |
| ドキュメント | 高 | JSDoc、ABDDヘッダーが完備 |
| テスタビリティ | 中 | 外部依存が多い（モック困難） |

### リスク評価

| リスク | 影響度 | 確率 | 緩和策 |
|--------|--------|------|--------|
| 無限ループ | 高 | 中 | ユーザー停止 + 安全停止 + タイムアウト |
| リソース枯渇 | 高 | 低 | キャパシティ制御、レートリミット |
| 状態不整合 | 中 | 低 | 不変条件の強制、検証ステップ |
| Gitコンフリクト | 中 | 低 | 自動コミットメッセージ、プル前チェック |

---

## 推奨事項

### アーキテクチャ

1. **既存loop.tsを拡張せず、新規self-improvement-loop.tsを作成**
   - 理由: 関心の分離、既存機能への影響回避
   - 共通部分はlib/agent-common.ts等から再利用

2. **状態管理はRedis/ファイルベースの永続化**
   - 理由: 長時間実行、プロセス再起動対応
   - 形式: JSON（現在のログ構造と整合）

3. **7つの視座は順次実行ではなく、ラウンドロビン**
   - 理由: 脱構築→論理学の一直線ではなく、相互参照を可能に
   - 各サイクルで1視座を深く探求

### 前処理ステップ

1. 既存loop.tsのインターフェースを分析完了
2. self-improvementスキルの7視座をデータ構造化完了
3. 統合設計の方向性を特定完了

### 適切な分析手法

- **状態遷移解析**: ループの停止条件と再開条件の設計
- **パターンマッチング**: 7視座の実行パターンの定義
- **統計的評価**: サイクル数、視座別実行時間のメトリクス収集

### 可視化アプローチ

- 状態遷移図（Mermaid形式）
- 7視座のサイクル図
- 実行ログのタイムライン表示

---

## 仮説リスト

### H1: 拡張アプローチ（新規ファイル作成）
**仮説**: 既存のloop.tsを拡張せず、新規self-improvement-loop.tsを作成することで、7つの哲学的視座に基づく終わりなき自己改善ループを実装できる。

**根拠**:
- loop.tsは「タスク完了型」に特化（stewardの分析）
- 新規作成により関心の分離が可能
- 共通lib（agent-common.ts等）から再利用可能

**反証可能性**: 既存loop.tsを拡張する方が統合的に優れる場合、この仮説は棄却される。

### H2: 状態管理アプローチ
**仮説**: 単一のLoopStatus（continue/done）を多次元のPerspectiveState配列に拡張することで、7視座の状態を管理できる。

**根拠**:
- 各視座は独立した探索状態を持つ
- 現在のiteration-builder.tsは拡張可能な構造
- JSON形式での永続化が容易

**反証可能性**: 状態が複雑すぎて管理不能になる場合、階層的状態管理が必要。

### H3: 停止機構アプローチ
**仮説**: ユーザー明示的停止 + 安全停止（現在のタスク完了後）の組み合わせで、安全に停止できる。

**根拠**:
- loop.tsのstagnation検出が参考になる
- AbortSignalによるキャンセル処理が既にある
- ログ構造が再開をサポート

**反証可能性**: 停止要求から実際の停止までの遅延が許容できない場合、即時停止が必要。

### H4: Git統合アプローチ
**仮説**: 各サイクル終了時に自動コミットすることで、作業の追跡とロールバックが可能になる。

**根拠**:
- git-workflowスキルが存在
- loop.tsのログ構造がコミットメッセージ生成をサポート
- 変更の粒度が適切（サイクル単位）

**反証可能性**: コミット頻度が高すぎて履歴が汚染される場合、バッチコミットが必要。

---

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 状態が復元されない | ログフォーマット不一致 | バリデーション追加 |
| 無限ループ | 停止条件の欠落 | タイムアウト + 最大サイクル数 |
| Gitコンフリクト | 並列実行 | ロック機構の追加 |
| メモリ枯渇 | ログ蓄積 | ローテーション実装 |

---

## 関連リソース

- `.pi/extensions/loop.ts`: 既存ループ実装
- `.pi/extensions/loop/iteration-builder.ts`: プロンプト生成
- `.pi/lib/semantic-repetition.ts`: 停滞検出
- `.pi/skills/self-improvement/SKILL.md`: 7つの哲学的視座
- `.pi/skills/git-workflow/SKILL.md`: Git統合

---

*EDA Analyst (eda-analyst) により生成*
