---
title: Verification Workflow
category: reference
audience: developer
last_updated: 2026-02-18
tags: [verification, inspector, challenger, reasoning]
related: []
---

# Verification Workflow

論文「Large Language Model Reasoning Failures」のP0推奨事項に基づくInspector/Challengerエージェントによる自動検証メカニズム。

## Types

### VerificationWorkflowConfig

検証ワークフロー設定。

```typescript
interface VerificationWorkflowConfig {
  enabled: boolean;
  triggerModes: VerificationTriggerMode[];
  challengerConfig: ChallengerConfig;
  inspectorConfig: InspectorConfig;
  fallbackBehavior: FallbackBehavior;
  maxVerificationDepth: number;
  minConfidenceToSkipVerification: number;
}
```

### VerificationTriggerMode

検証トリガーモード。

```typescript
type VerificationTriggerMode =
  | "post-subagent"     // サブエージェント実行後
  | "post-team"         // チーム実行後
  | "low-confidence"    // 低信頼度時
  | "explicit"          // 明示的な要求時
  | "high-stakes";      // 高リスクタスク時
```

### FallbackBehavior

フォールバック動作。

```typescript
type FallbackBehavior =
  | "warn"              // 警告のみ
  | "block"             // ブロックして再実行
  | "auto-reject";      // 自動拒否
```

### ChallengerConfig

Challenger設定。

```typescript
interface ChallengerConfig {
  minConfidenceToChallenge: number;
  requiredFlaws: number;
  enabledCategories: ChallengeCategory[];
}
```

### ChallengeCategory

チャレンジカテゴリ。

```typescript
type ChallengeCategory =
  | "evidence-gap"      // 証拠の欠落
  | "logical-flaw"      // 論理的欠陥
  | "assumption"        // 隠れた仮定
  | "alternative"       // 代替解釈の未考慮
  | "boundary"          // 境界条件の未考慮
  | "causal-reversal";  // 因果関係の逆転
```

### InspectorConfig

Inspector設定。

```typescript
interface InspectorConfig {
  suspicionThreshold: SuspicionThreshold;
  requiredPatterns: InspectionPattern[];
  autoTriggerOnCollapseSignals: boolean;
}
```

### InspectionPattern

検査パターン。

```typescript
type InspectionPattern =
  | "claim-result-mismatch"    // CLAIMとRESULTの不一致
  | "evidence-confidence-gap"  // 証拠と信頼度のミスマッチ
  | "missing-alternatives"     // 代替解釈の欠如
  | "causal-reversal"          // 因果の逆転
  | "confirmation-bias"        // 確認バイアスの兆候
  | "overconfidence"           // 過信
  | "incomplete-reasoning";    // 不完全な推論
```

### VerificationResult

検証結果。

```typescript
interface VerificationResult {
  triggered: boolean;
  triggerReason: string;
  inspectorOutput?: InspectorOutput;
  challengerOutput?: ChallengerOutput;
  finalVerdict: VerificationVerdict;
  confidence: number;
  requiresReRun: boolean;
  warnings: string[];
}
```

### VerificationVerdict

検証判定。

```typescript
type VerificationVerdict =
  | "pass"              // 検証通過
  | "pass-with-warnings" // 警告付き通過
  | "needs-review"      // 人間のレビューが必要
  | "fail"              // 検証失敗
  | "blocked";          // ブロック（再実行必要）
```

### InspectorOutput

Inspector出力。

```typescript
interface InspectorOutput {
  suspicionLevel: SuspicionThreshold;
  detectedPatterns: DetectedPattern[];
  summary: string;
  recommendation: string;
}
```

### ChallengerOutput

Challenger出力。

```typescript
interface ChallengerOutput {
  challengedClaims: ChallengedClaim[];
  overallSeverity: "minor" | "moderate" | "critical";
  summary: string;
  suggestedRevisions: string[];
}
```

### VerificationContext

検証コンテキスト。

```typescript
interface VerificationContext {
  task: string;
  triggerMode: "post-subagent" | "post-team" | "explicit" | "low-confidence" | "high-stakes";
  agentId?: string;
  teamId?: string;
  previousVerifications?: number;
}
```

## Constants

### DEFAULT_VERIFICATION_CONFIG

デフォルト設定。

```typescript
const DEFAULT_VERIFICATION_CONFIG: VerificationWorkflowConfig = {
  enabled: false,
  triggerModes: ["post-subagent", "low-confidence", "high-stakes"],
  challengerConfig: {
    minConfidenceToChallenge: 0.85,
    requiredFlaws: 1,
    enabledCategories: ["evidence-gap", "logical-flaw", "assumption", "alternative", "boundary", "causal-reversal"],
  },
  inspectorConfig: {
    suspicionThreshold: "medium",
    requiredPatterns: ["claim-result-mismatch", "evidence-confidence-gap", "missing-alternatives", "causal-reversal", "confirmation-bias", "overconfidence"],
    autoTriggerOnCollapseSignals: true,
  },
  fallbackBehavior: "warn",
  maxVerificationDepth: 2,
  minConfidenceToSkipVerification: 0.9,
};
```

### HIGH_STAKES_PATTERNS

高リスクタスク検出用の正規表現パターン配列（70+パターン）。

カテゴリ:
1. 削除・破壊的操作
2. 本番環境・リリース
3. セキュリティ・認証
4. データベース操作
5. API契約変更
6. 認可・アクセス制御
7. インフラ・デプロイ
8. 機密データ・コスト
9. 不可逆操作・危険フラグ

## Main Functions

### shouldTriggerVerification()

検証が必要かどうかを判断。

```typescript
function shouldTriggerVerification(
  output: string,
  confidence: number,
  context: VerificationContext
): { trigger: boolean; reason: string }
```

### isHighStakesTask()

高リスクタスクかどうかを判定。

```typescript
function isHighStakesTask(task: string): boolean
```

### resolveVerificationConfig()

検証設定を解決。環境変数から設定を読み込む。

```typescript
function resolveVerificationConfig(): VerificationWorkflowConfig
```

### buildInspectorPrompt()

Inspectorプロンプトを生成。

```typescript
function buildInspectorPrompt(
  targetOutput: string,
  context: VerificationContext
): string
```

### buildChallengerPrompt()

Challengerプロンプトを生成。

```typescript
function buildChallengerPrompt(
  targetOutput: string,
  context: VerificationContext
): string
```

### synthesizeVerificationResult()

検証結果を統合。

```typescript
function synthesizeVerificationResult(
  originalOutput: string,
  originalConfidence: number,
  inspectorOutput: InspectorOutput | undefined,
  challengerOutput: ChallengerOutput | undefined,
  context: VerificationContext
): VerificationResult
```

### getVerificationWorkflowRules()

検証ワークフロー実行ルールを取得。execution-rules.tsで使用。

```typescript
function getVerificationWorkflowRules(): string
```

## Environment Variables

| 変数名 | 説明 | 値 |
|--------|------|-----|
| PI_VERIFICATION_WORKFLOW_MODE | ワークフローモード | disabled, minimal, auto, strict |
| PI_VERIFICATION_MIN_CONFIDENCE | 検証スキップの信頼度閾値 | 0.0 - 1.0 |
| PI_VERIFICATION_MAX_DEPTH | 最大検証深度 | 1 - 5 |

## 使用例

```typescript
// 検証が必要かチェック
const result = shouldTriggerVerification(
  "CLAIM: Test\nCONFIDENCE: 0.5\nRESULT: Result",
  0.5,
  { task: "Analyze code", triggerMode: "post-subagent" }
);

if (result.trigger) {
  // Inspectorを起動
  const inspectorPrompt = buildInspectorPrompt(output, context);
  
  // Challengerを起動
  const challengerPrompt = buildChallengerPrompt(output, context);
  
  // 結果を統合
  const finalResult = synthesizeVerificationResult(
    output,
    confidence,
    inspectorOutput,
    challengerOutput,
    context
  );
}
```

## 関連ファイル

- `.pi/lib/verification-workflow.test.ts` - テストファイル
