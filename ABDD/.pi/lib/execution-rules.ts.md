---
title: Execution Rules
category: reference
audience: developer
last_updated: 2026-02-18
tags: [rules, guidelines, cognitive-bias, verification]
related: [subagents, agent-teams]
---

# Execution Rules

全てのエージェントおよびサブエージェントに適用される共通実行ルール。

## 概要

論文「Large Language Model Reasoning Failures」の知見に基づき、認知バイアス対策、自己検証、作業記憶管理などのルールを定義する。

## 定数

### COMMON_EXECUTION_RULES

全てのエージェントに適用される基本ルール。

```typescript
const COMMON_EXECUTION_RULES: readonly string[]
```

**内容:**
- 絵文字・装飾記号の禁止
- questionツールの使用義務
- 不必要なユーザー確認の回避
- 十分な情報の提供

### SUBAGENT_SPECIFIC_RULES

サブエージェント固有の実行ルール。

```typescript
const SUBAGENT_SPECIFIC_RULES: readonly string[]
```

**内容:**
- 具体的なファイルパスと行番号の明示
- 仮定は短く置き、実装に進む

### TEAM_MEMBER_SPECIFIC_RULES

チームメンバー固有の実行ルール。

```typescript
const TEAM_MEMBER_SPECIFIC_RULES: readonly string[]
```

**内容:**
- 出力内容は必ず日本語で書く
- 連携相手の主張に最低1件は明示的に言及
- 連携内容を踏まえて自分の結論を更新

### COGNITIVE_BIAS_COUNTERMEASURES

認知バイアス対策ルール。

```typescript
const COGNITIVE_BIAS_COUNTERMEASURES: string
```

**対策対象:**
1. 確認バイアス (Confirmation Bias)
2. アンカリング効果 (Anchoring Bias)
3. フレーミング効果 (Framing Effect)
4. Reversal Curse対策
5. 追従バイアス (Sycophancy Bias)

### SELF_VERIFICATION_RULES

自己検証チェックリスト。

```typescript
const SELF_VERIFICATION_RULES: string
```

**確認事項:**
1. 自己矛盾チェック
2. 証拠の過不足評価
3. 境界条件の明示
4. 代替解釈の考慮

### WORKING_MEMORY_GUIDELINES

作業記憶管理ルール。

```typescript
const WORKING_MEMORY_GUIDELINES: string
```

**実践事項:**
1. 状態要約の維持
2. プロアクティブ干渉の回避
3. 段階的な推論

### TERMINATION_CHECK_RULES

終了チェックルール（P0推奨事項）。

```typescript
const TERMINATION_CHECK_RULES: string
```

**確認事項:**
1. 完了基準の明示
2. 完了確信度の評価
3. 残存リスクの特定

### COMPOSITIONAL_INFERENCE_RULES

構成推論サポートルール（P1推奨事項）。

```typescript
const COMPOSITIONAL_INFERENCE_RULES: string
```

**実践事項:**
1. 複数知識統合チェック
2. マルチホップ推論の検証
3. 知識の信頼性評価

### CHALLENGE_RULES

異議申し立てガイドライン（Challenger agents用）。

```typescript
const CHALLENGE_RULES: string
```

**実践事項:**
1. 具体的な欠陥の指摘
2. 証拠の欠落指摘
3. 代替解釈の提示
4. 重要度の評価

### INSPECTION_RULES

検査ガイドライン（Inspector agents用）。

```typescript
const INSPECTION_RULES: string
```

**確認事項:**
1. CLAIM-RESULT整合性
2. 証拠-信頼度ミスマッチ
3. 代替解釈の欠如
4. 因果関係の逆転
5. 信頼度評価

### VERIFICATION_WORKFLOW_RULES

検証ワークフロールール。

```typescript
const VERIFICATION_WORKFLOW_RULES: string
```

**ワークフロー:**
1. 自己検証チェック
2. Inspector起動条件
3. Challenger起動条件
4. 検証結果への対応

### AUTONOMY_GUIDELINES

自走性の判断基準。

```typescript
const AUTONOMY_GUIDELINES: string
```

**ユーザー確認なしで進めて良い場合:**
- 変更範囲が5ファイル以下
- ドキュメントの更新
- テストコードの追加・修正
- コードフォーマットやリファクタリング
- バグ修正（破壊的変更なし）
- 読み取り専用の調査

**ユーザー確認が必要な場合:**
- 破壊的な変更
- 外部リソースへのアクセス
- 設定や構造の根本的な変更

### NO_SHORTCUTS_GUIDELINES

プロンプト品質のチェックリスト。

```typescript
const NO_SHORTCUTS_GUIDELINES: string
```

**項目:**
1. 情報の完全性
2. 具体性
3. 品質
4. 完全性

### QUESTION_TOOL_GUIDELINES

questionツール使用の詳細ガイドライン。

```typescript
const QUESTION_TOOL_GUIDELINES: string
```

## 関数

### buildExecutionRulesSection(options)

実行ルールセクションを構築する。結果はキャッシュされる。

```typescript
function buildExecutionRulesSection(
  options?: BuildExecutionRulesOptions
): string
```

### getSubagentExecutionRules(includeGuidelines)

サブエージェント用の実行ルールを取得する。

```typescript
function getSubagentExecutionRules(includeGuidelines?: boolean): string
```

### getTeamMemberExecutionRules(phase, includeGuidelines)

チームメンバー用の実行ルールを取得する。

```typescript
function getTeamMemberExecutionRules(
  phase?: "initial" | "communication",
  includeGuidelines?: boolean
): string
```

### getChallengerExecutionRules(includeGuidelines)

Challengerサブエージェント用の実行ルールを取得する。

```typescript
function getChallengerExecutionRules(includeGuidelines?: boolean): string
```

### getInspectorExecutionRules(includeGuidelines)

Inspectorサブエージェント用の実行ルールを取得する。

```typescript
function getInspectorExecutionRules(includeGuidelines?: boolean): string
```

### getVerificationWorkflowExecutionRules(phase, includeGuidelines)

検証ワークフロー用の実行ルールを取得する。

```typescript
function getVerificationWorkflowExecutionRules(
  phase?: "inspector" | "challenger" | "both",
  includeGuidelines?: boolean
): string
```

## BuildExecutionRulesOptions

```typescript
interface BuildExecutionRulesOptions {
  forSubagent?: boolean;
  forTeam?: boolean;
  phase?: "initial" | "communication";
  includeGuidelines?: boolean;
  includeDiscussionRules?: boolean;
  includeCognitiveBiasCountermeasures?: boolean;
  includeSelfVerification?: boolean;
  includeWorkingMemoryGuidelines?: boolean;
  includeTerminationCheck?: boolean;
  includeCompositionalInference?: boolean;
  includeChallengeRules?: boolean;
  includeInspectionRules?: boolean;
  includeVerificationWorkflow?: boolean;
}
```

## 使用例

```typescript
import { getSubagentExecutionRules, getTeamMemberExecutionRules } from "./execution-rules.js";

// サブエージェント用ルール
const subagentRules = getSubagentExecutionRules(true);

// チームメンバー用ルール（コミュニケーションフェーズ）
const teamRules = getTeamMemberExecutionRules("communication", true);

// Challenger用ルール
const challengerRules = getChallengerExecutionRules();
```

## 関連ファイル

- `./subagents.ts` - サブエージェント拡張
- `./agent-teams.ts` - エージェントチーム拡張
