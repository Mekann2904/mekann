---
title: エージェント設計の厳密実装計画
category: meta
audience: developer, contributor
last_updated: 2026-03-07
tags: [agent-architecture, prompting, model-adaptation, tool-design, roadmap]
related: [./03-roadmap.md, ./06-autonomy-improvement-plan.md, ../../README.md, ../../ABDD/spec.md]
---

# エージェント設計の厳密実装計画

> パンくず: [Home](../../README.md) > [Meta](./README.md) > エージェント設計の厳密実装計画

## 概要

本計画は、mekann を「多機能な拡張集」から「モデル非依存で高性能なエージェントフレームワーク」へ引き上げるための調査結果と実装計画をまとめたものです。

前提は明確です。

最速実装は目指しません。

性能、再現性、可観測性、失敗時の回復性を含めて、長期運用に耐える実装を目指します。

---

## 調査対象

今回の計画は、以下の既存実装を調査した上で作成しています。

- `.pi/extensions/append-system-loader.ts`
- `.pi/extensions/startup-context.ts`
- `.pi/extensions/plan.ts`
- `.pi/extensions/subagents.ts`
- `.pi/extensions/subagents/task-execution.ts`
- `.pi/extensions/agent-runtime.ts`
- `.pi/extensions/dynamic-tools.ts`
- `.pi/lib/provider-limits.ts`
- `.pi/lib/prompt-templates.ts`
- `.pi/lib/dynamic-tools/safety.ts`
- `.pi/lib/dynamic-tools/registry.ts`
- `docs/05-meta/06-autonomy-improvement-plan.md`
- `docs/02-user-guide/18-parallel-llm-architecture.md`
- `.pi/proposals/plan-task-dag-integration.md`
- `.pi/skills/task-planner/SKILL.md`

---

## 調査結果

### 1. 階層型プロンプティング

部分的に実装済みです。

既に `before_agent_start` で複数の注入が走ります。

- `append-system-loader.ts`: `.pi/APPEND_SYSTEM.md` を注入
- `startup-context.ts`: セッション開始時と差分コンテキストを注入
- `plan.ts`: plan mode の方針を注入
- `subagents.ts`: proactive delegation の方針を注入

ただし、これは「複数の注入ポイント」であって、「統一された階層型プロンプトシステム」ではありません。

優先順位、衝突解決、圧縮方針、モデル別の出し分けが分散しています。

### 2. モデル別最適化

基盤はあります。

- `provider-limits.ts`: provider/model/tier ごとの制限管理
- `agent-runtime.ts`: 実行容量、並列数、適応制御
- `task-execution.ts`: internal mode と user-facing mode の分岐

ただし、最適化の対象が主に「並列数」「タイムアウト」「一部プロンプト分岐」に留まっています。

モデルごとの直近バイアス、通知頻度、編集形式、パス表現、ツールスキーマ耐性までは扱えていません。

### 3. ツール設計

良い方向の実装があります。

- `dynamic-tools.ts` と `dynamic-tools/registry.ts`: ツール生成と登録
- `dynamic-tools/safety.ts`: 危険操作の静的解析
- `subagents/task-execution.ts`: 3層の出力パイプライン

ただし、システム全体として見ると、コアツールの責務はまだ大きいです。

特に `subagents.ts`、`loop.ts`、`agent-runtime.ts` は機能密度が高く、失敗率を最小化するための「最小主義の道具立て」にはなっていません。

---

## 現状評価

### 既にある強み

| 領域 | 現状 | 評価 |
|------|------|------|
| システム注入 | 複数の `before_agent_start` 拡張あり | 強い |
| 出力安定化 | Layer 1-3 相当の出力補正あり | 強い |
| 並列制御 | runtime guard, adaptive, cross-instance あり | 強い |
| 動的ツール | 生成・安全性・監査がある | 強い |
| サブエージェント | 役割分化と実行基盤がある | 強い |

### 足りないもの

| 欠落 | 問題 |
|------|------|
| Prompt Stack の統一表現 | 指示が散らばり、優先順位が曖昧 |
| Model Adapter 層 | モデル差を体系的に吸収できない |
| Runtime Notification 層 | 時限的・状況依存の指示を正規化できない |
| Tool Contract の縮小 | ツール呼び出し失敗率をまだ下げ切れない |
| 評価ハーネス | 改善が本当に効いたかを定量確認しにくい |

---

## 目標アーキテクチャ

実装方針は、次の 4 層に整理します。

### A. Tool Description Layer

ツールの役割、入力契約、失敗時の扱いを最小単位で定義する層です。

ここでは「何ができるか」だけを扱います。

「どう振る舞うべきか」は持ち込みません。

### B. System Policy Layer

エージェントの恒常的な行動原則を定義する層です。

例:

- 証拠優先
- 非自明タスクでは委任優先
- 高リスク時は検証優先
- plan mode の行動制約

### C. Runtime Notification Layer

直近の状況に応じて差し込む短命の指示です。

例:

- 今回は rate limit 後なので探索を縮小
- 直前の出力が空だったので構造を厳守
- 依存タスクの結果に矛盾あり
- 直近ターンでは search ツール優先

### D. Model Adapter Layer

モデルごとの癖を吸収する層です。

例:

- instruction density
- notice placement
- output strictness
- path style
- edit style
- tool schema verbosity

---

## 設計原則

### 1. 注入ポイントを増やさない

新しい指示は新しい `before_agent_start` を増やして足すのではなく、共通の Prompt Stack Builder に集約します。

### 2. 恒常指示と時限指示を分ける

永続ルールを system prompt に入れ、直近の制御は runtime notification に入れます。

### 3. モデル差は if 文ではなく adapter に閉じ込める

`if model.includes(...)` を各所に増やしません。

### 4. ツールは小さく、入力は短く、結果は構造化する

複雑な多目的ツールより、失敗しにくい単機能ツールを優先します。

### 5. 改善は必ず計測する

感覚で「良くなった」と判断しません。

---

## 実装ワークストリーム

### Workstream 1: Prompt Stack 統合

新設候補:

- `.pi/lib/agent/prompt-stack.ts`
- `.pi/lib/agent/prompt-stack-types.ts`
- `.pi/lib/agent/runtime-notifications.ts`

責務:

- 既存の注入を `tool_description / system_policy / runtime_notification / startup_context` に分類
- 優先順位と merge ルールを定義
- 重複除去
- token budget に応じた圧縮
- 注入ログの構造化

### Workstream 2: Model Adapter 導入

新設候補:

- `.pi/lib/agent/model-adapters.ts`
- `.pi/lib/agent/model-adapter-types.ts`

責務:

- OpenAI / Anthropic / Google 系の標準アダプタ定義
- `internal` / `user-facing` / `research` / `high-risk` ごとの prompt policy
- path style, edit style, notice policy の切り替え

### Workstream 3: Subagent / Loop 再配線

主対象:

- `.pi/extensions/subagents/task-execution.ts`
- `.pi/extensions/subagents.ts`
- `.pi/extensions/loop.ts`

責務:

- `buildSubagentPrompt()` を Prompt Stack ベースへ移行
- loop の iteration prompt を同じ仕組みに寄せる
- 高リスク再生成、search extension 有効化、plan mode を共通通知で扱う

### Workstream 4: Tool Contract 縮小

主対象:

- `.pi/extensions/dynamic-tools.ts`
- `.pi/extensions/subagents.ts`
- `.pi/extensions/loop.ts`
- `.pi/extensions/question.ts`

責務:

- スキーマ監査
- 入力項目の削減
- 役割の分割
- read-only / mutating / orchestration の分離
- tool description の簡潔化

### Workstream 5: 評価・検証ハーネス

新設候補:

- `tests/e2e/agent-architecture-benchmark.e2e.test.ts`
- `tests/integration/prompt-stack.integration.test.ts`
- `tests/unit/lib/model-adapters.test.ts`
- `tests/unit/lib/runtime-notifications.test.ts`

責務:

- A/B 比較
- 失敗率の可視化
- プロンプト層別のトークン量測定
- モデル別の安定性確認

---

## フェーズ計画

### Phase 0: 調査固定化

目的:

これ以上、局所的な if 文で拡張しないための基準を先に決めます。

作業:

- 既存注入ポイントを一覧化
- 既存ツールを read-only / mutating / orchestration に分類
- モデル差分の観測項目を決定
- ベンチマーク指標を確定

成果物:

- Prompt Stack inventory
- Tool contract inventory
- Model behavior matrix

完了条件:

- 追加実装前に設計の棚卸しが終わっている

### Phase 1: Prompt Stack MVP

目的:

散在する注入を、単一の合成器にまとめます。

作業:

- Prompt Stack 型定義
- merge 優先順位
- dedupe
- `append-system-loader`, `plan`, `startup-context`, `subagents` の統合

完了条件:

- `before_agent_start` での最終 system prompt 構成が追跡可能
- 注入元ごとの token 使用量を表示できる

### Phase 2: Runtime Notification 正式化

目的:

「直近バイアス」を逆に利用して、重要な短命指示を最後段で制御できるようにします。

作業:

- notification schema
- severity / ttl / trigger / target tools
- rate limit, schema violation, empty output, dependency conflict, high-risk 用の通知実装

完了条件:

- 一時的な指示が恒常 prompt に混ざらない
- 通知の発火条件がテストで固定される

### Phase 3: Model Adapter 導入

目的:

モデル別最適化を散発実装から体系実装へ変えます。

作業:

- adapter interface 定義
- provider/model pattern ごとの adapter 実装
- subagent prompt と loop prompt への適用
- path/edit/output style の切り替え

完了条件:

- モデル差分の実装場所が adapter 層に集約される
- task-execution と loop から生の model-specific 分岐が減る

### Phase 4: Tool Contract の再設計

目的:

ツール呼び出し失敗率を下げます。

作業:

- 大きいツールの責務分割
- 冗長パラメータの削除
- alias / wrapper の導入
- tool description の文量削減
- 高リスクツールに verification hook を標準接続

完了条件:

- 主要ツールで入力スキーマ長が短縮される
- 無効入力と部分失敗のテストが増える

### Phase 5: 評価ハーネス

目的:

改善を定量で確認します。

評価指標:

- task completion rate
- tool call error rate
- retry rate
- empty output rate
- structured output compliance
- average turns
- average prompt tokens
- recovery success rate

完了条件:

- ベースラインと比較して改善が見える
- 改悪時に検知できる

### Phase 6: 本番移行と保守設計

目的:

一度入れて終わりにしません。

作業:

- feature flag 化
- fallback path の維持
- telemetry の定期レビュー
- model adapter 更新手順の文書化

完了条件:

- 新モデル追加時の実装手順が固定される
- 既存利用者を壊さず移行できる

---

## 優先順位

| 優先度 | 項目 | 理由 |
|--------|------|------|
| P0 | Prompt Stack 統合 | ここが散っている限り他の最適化が再び散る |
| P0 | Runtime Notification | 直近バイアス対策の要 |
| P1 | Model Adapter | モデル差を吸収する主戦場 |
| P1 | Subagent / Loop 再配線 | 実際の性能に最も効く |
| P2 | Tool Contract 再設計 | 失敗率低減に効く |
| P2 | Benchmark Harness | 改善の証明に必要 |

---

## 主要リスク

### リスク 1: prompt がさらに肥大化する

対策:

- layer ごとの token budget を設ける
- notification は短文化する
- startup context は差分注入を維持する

### リスク 2: adapter が provider-limits と責務衝突する

対策:

- `provider-limits.ts` は容量制御だけ
- `model-adapters.ts` は行動最適化だけ

### リスク 3: backward compatibility を壊す

対策:

- feature flag 導入
- 既存 prompt builder を残した段階移行

### リスク 4: ベンチが恣意的になる

対策:

- synthetic だけでなく既存 E2E も使用
- 成功率だけでなく失敗率も測る

---

## 受け入れ基準

この計画の完了条件は、単に新ファイルが増えることではありません。

以下を満たす必要があります。

1. Prompt Stack の構成が観測できる。
2. Runtime Notification が恒常ルールと分離されている。
3. モデル差分の実装位置が adapter 層に集約されている。
4. 主要ツールのスキーマが短くなり、失敗率が下がる。
5. ベースライン比較で改善を説明できる。
6. 既存利用者向けの fallback が残る。

---

## 推奨する最初の実装順

最初の 3 手は固定です。

1. Prompt Stack inventory と merge ルールの文書化
2. `prompt-stack.ts` と `runtime-notifications.ts` の追加
3. `subagents/task-execution.ts` だけを先に新方式へ移行

この順番にする理由は、サブエージェント実行が最も効果測定しやすく、かつ現状の設計負債が最も集まっている場所だからです。

---

## 非目標

今回の計画では、以下は最初の実装対象にしません。

- 学習済みモデルの再訓練
- 外部 GPU 基盤を前提にした RL
- すべての拡張機能の一括再設計
- tool 数を増やすこと自体

---

## 関連トピック

- [ロードマップ](./03-roadmap.md) - 全体ロードマップ
- [エージェント自走力とコーディング性能向上計画](./06-autonomy-improvement-plan.md) - 既存の改善計画
- [並列LLM呼び出しアーキテクチャ](../02-user-guide/18-parallel-llm-architecture.md) - 現行の実行基盤
- [ABDD spec](../../ABDD/spec.md) - 不変条件

## 次のトピック

[ → エージェント自走力とコーディング性能向上計画](./06-autonomy-improvement-plan.md)
