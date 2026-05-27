# Plan mode / Main mode 使用方法

## 概要

Plan mode と Main mode は、実装の前後を行き来するための2つのコラボレーションモードです。
ユーザーの自然言語による指示だけで、LLM が自律的にモードを切り替えられます。

```
Plan mode（計画） ──→ Main mode（実装） ──→ Plan mode（計画修復）
      ↑                                        │
      └────────── return_to_plan ──────────────┘
```

## Plan mode

### 目的

実装に入る前に、スコープ・設計・要件・リスク・検証を明確にするための計画モードです。

### Plan mode でやること

- 要件のヒアリング（grill-with-docs）
- PRD の作成（to-prd）
- Issue への分解（to-issues）
- アーキテクチャ設計（improve-codebase-architecture）
- プロトタイピング（prototype）
- バグ診断（diagnose）

### Plan mode でやらないこと

- プロダクトコードの編集
- テストコードの編集
- 実行時設定の変更

### スキルルーティング

Plan mode では、ユーザーの依頼内容に応じて最適なスキルが自動選択されます。

| 依頼内容 | スキル |
|----------|--------|
| バグ・障害・回帰 | diagnose |
| 曖昧なアイデア・設計議論 | grill-with-docs |
| 大きな機能・要件 | to-prd |
| PRD・計画の分解 | to-issues |
| アーキテクチャ・リファクタリング | improve-codebase-architecture |
| UI・状態モデルの不確実性 | prototype |
| 小さく明確な実装タスク | tdd |

## Main mode

### 目的

Plan mode で作成した計画を実行する実装モードです。現在進行中のスキルフローの実装フェーズでもあります。

### Main mode でやること

- 計画に沿った実装
- テスト駆動開発（TDD）
- バリデーション・テスト実行
- 実装結果の報告

### Main mode の実装指針

- 直前の計画が選んだスキルを優先する（通常は TDD）
- 計画の意図・Issue 境界・受け入れ基準を保持する
- スコープを勝手に広げない
- 計画が間違っている・不完全な場合は、重大判断を即興せず Plan mode に戻す

## モード遷移

### 手動遷移

| 操作 | 効果 |
|------|------|
| `/plan` | Plan ↔ Main を切り替え |
| `Cmd+P` / `Ctrl+P` | 同上（ショートカット） |
| `/read-only` | Read-only モード切替 |

### LLM-callable 遷移ツール

手動 `/plan` を打たなくても、自然言語による意思表示で LLM が自律的にモードを切り替えられます。

#### proceed_to_main

Plan mode から Main mode へ移行します。

**使う場面**:
- ユーザーが自然言語で実装を承認した（「実装して」「進めて」「go ahead」）
- 計画が小さく明確で実装可能
- Plan mode がこれ以上不要

**パラメータ**:

| パラメータ | 必須 | 説明 |
|------------|------|------|
| `reason` | ✅ | Main mode を開始する理由 |
| `implementationIntent` | ✅ | Main mode で実装する内容 |
| `suggestedSkill` | - | 実装に使うスキル（現在は `"tdd"` のみ） |

**例**:

```text
User: 実装して
LLM: proceed_to_main({ reason: "User approved implementation", implementationIntent: "completed plan" })
→ Main mode active. 実装開始.
```

#### return_to_plan

Main mode から Plan mode へ戻ります。

**使う場面**:
- 実装中に仕様の穴が見つかった
- アーキテクチャリスクが発覚した
- UI/状態設計が不明瞭になった
- バグ原因が未解決のまま
- 次スライスに計画が必要
- 影響の大きい判断が必要

**パラメータ**:

| パラメータ | 必須 | 説明 |
|------------|------|------|
| `reason` | ✅ | Plan mode に戻る理由 |
| `planningNeed` | ✅ | 発見された計画課題の種類 |
| `suggestedSkill` | ✅ | 再開すべき計画スキル |
| `summary` | - | 計画ターンのための短い文脈 |

**planningNeed の値**:

| 値 | 意味 |
|-----|------|
| `spec_gap` | 仕様・用語の穴 |
| `architecture_risk` | アーキテクチャ・結合・テスタビリティリスク |
| `ui_uncertainty` | UI・状態・インタラクションの不確実性 |
| `bug_cause_unresolved` | 未解決のバグ原因・予期しない回帰 |
| `high_impact_decision` | 影響大のプロダクト・エンジニアリング判断 |
| `next_slice_needs_planning` | 次スライスがまだ明確でない |

**suggestedSkill の値**:

| 値 | 対応する planningNeed |
|-----|----------------------|
| `grill-with-docs` | spec_gap |
| `to-prd` | spec_gap |
| `to-issues` | next_slice_needs_planning |
| `improve-codebase-architecture` | architecture_risk |
| `prototype` | ui_uncertainty |
| `diagnose` | bug_cause_unresolved |

**例**:

```text
（実装中にモジュール境界が不明瞭なことに気づく）
LLM: return_to_plan({ reason: "Current seam is not testable", planningNeed: "architecture_risk", suggestedSkill: "improve-codebase-architecture" })
→ Plan mode active. improve-codebase-architecture で計画修復.
```

## モード遷移のガード

| 状況 | 結果 |
|------|------|
| Plan mode 以外で `proceed_to_main` | エラー `not_in_plan_mode` |
| Main mode 以外で `return_to_plan` | エラー `not_in_main_mode` |

## Plan mode の出口チェックポイント

Plan mode で選択されたスキルが完了した後、次に何をすべきか判断します：

| 状態 | 出口 |
|------|------|
| 大規模 / マルチスライス計画 | to-issues |
| 仕様がまだ不明瞭 | to-prd |
| 小さく明確で実装可能 | tdd → ユーザーに実装確認 |
| アーキテクチャリスクが残る | improve-codebase-architecture |
| UI / 状態 / インタラクションが不確か | prototype |
| バグ原因が未解決 | diagnose |
| 影響大の未解決な意思決定 | ask the user |
| 上記いずれでもない | 停止 / 文書更新 |

## Main mode の完了チェックポイント

Main mode で実装スライスが完了した後、スキルフロー全体が完了したか判断します：

| 状態 | アクション |
|------|----------|
| 全体フロー完了 | 変更報告 → バリデーション → ニュートラル状態 |
| マルチスライス未完・次スライス明確 | ユーザーに確認 → TDD 継続 |
| 仕様・用語の穴を発見 | return_to_plan（grill-with-docs / to-prd） |
| アーキテクチャリスクを発見 | return_to_plan（improve-codebase-architecture） |
| UI・状態の不確実性を発見 | return_to_plan（prototype） |
| 未解決バグ・回帰を発見 | return_to_plan（diagnose） |
| 判断不能 | 停止 → ユーザーに確認 |

## 自然言語によるモード遷移の承認フレーズ

以下のような自然言語表現が「実装承認」として扱われ、LLM が `proceed_to_main` を呼ぶトリガーになります：

- 「実装して」
- 「進めて」
- 「それで作って」
- 「go ahead」
- 「proceed with implementation」
- 「continue with implementation」

## 典型的なワークフロー

### パターン 1: 単一スライスの実装

```text
User: ログイン画面のバリデーションを追加して
LLM: [Plan mode] grill-with-docs → 要件確認
LLM: 計画完了。実装に進みますか？
User: はい
LLM: proceed_to_main → [Main mode] TDD → 実装 → テスト → 完了報告
```

### パターン 2: マルチスライス

```text
User: 検索機能を実装して
LLM: [Plan mode] grill-with-docs → to-prd → to-issues（4スライスに分解）
User: 実装して
LLM: proceed_to_main → [Main mode] TDD → Issue #1 完了
LLM: Issue #1 完了。#2（ブロック解除済み）に進みますか？
User: はい
LLM: [Main mode 継続] TDD → Issue #2 完了
...
```

### パターン 3: 実装中に計画修復

```text
（Issue #2 実装中）
LLM: 現在のモジュール境界ではテストが書けません。アーキテクチャの見直しが必要です。
LLM: return_to_plan(planningNeed: "architecture_risk", suggestedSkill: "improve-codebase-architecture")
LLM: [Plan mode] improve-codebase-architecture → リファクタリング計画
User: 実装して
LLM: proceed_to_main → [Main mode] TDD → リファクタリング → Issue #2 再開
```

## Plan mode が解決するもの

- **旧来のデッドロック**: Plan mode が「実装に進みますか？」と聞くが、LLM 自身に mode を切り替える手段がなく、ユーザーは毎回 `/plan` を手動で打つ必要があった
- **`proceed_to_main`**: 自然言語の実装承認を受けて LLM が自律的に Main mode へ移行できる
- **`return_to_plan`**: 実装中に発見した計画課題を、適切なスキルとともに Plan mode に持ち帰れる

## 関連

- [ADR-0014: Separate Plan mode from Read-only mode](../../../docs/adr/0014-separate-plan-mode-from-read-only-mode.md)
- [ADR-0015: Continue unfinished skill flows after Main mode work](../../../docs/adr/0015-main-mode-skill-flow-continuation.md)
- [CONTEXT.md（Plan mode / Read-only mode 定義）](../../../CONTEXT.md)
- [plan-mode README](./README.md)
