---
title: verification-workflow
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# verification-workflow

## 概要

`verification-workflow` モジュールのAPIリファレンス。

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `shouldTriggerVerification` | 検証が必要か判断 |
| 関数 | `detectClaimResultMismatch` | CLAIM-RESULT不一致を検出 |
| 関数 | `detectOverconfidence` | 過信を検出 |
| 関数 | `detectMissingAlternatives` | 代替解釈の欠如を検出 |
| 関数 | `detectConfirmationBias` | 確認バイアスパターンを検出 |
| 関数 | `isHighStakesTask` | 高リスクタスク判定 |
| 関数 | `detectFirstReasonStopping` | 第1理由で探索停止を検出（バグハンティング） |
| 関数 | `detectProximityBias` | 近接性バイアスを検出（バグハンティング） |
| 関数 | `detectConcretenessBias` | 具体性バイアスを検出（バグハンティング） |
| 関数 | `detectPalliativeFix` | 対症療法的修正を検出（バグハンティング） |
| 関数 | `recognizeBugHuntingAporias` | アポリアを認識し、推奨される傾きを算出 |
| 関数 | `evaluateAporiaHandling` | アポリア対処の包括的評価を実行 |
| 関数 | `detectDystopianTendencies` | ディストピア傾向を検出 |
| 関数 | `detectHealthyImperfectionIndicators` | 健全な不完全さの指標を検出 |
| 関数 | `assessUtopiaDystopiaBalance` | ユートピア/ディストピア評価を実行 |
| 関数 | `detectDesirePatterns` | 欲望パターンを検出 |
| 関数 | `detectInnerFascismPatterns` | 内なるファシズムパターンを検出（スキゾ分析版） |
| 関数 | `performSchizoAnalysis` | スキゾ分析評価を実行 |
| 関数 | `resolveVerificationConfig` | 検証設定を解決 |
| 関数 | `buildInspectorPrompt` | 検査用プロンプトを構築 |
| 関数 | `buildChallengerPrompt` | 挑戦者用プロンプトを作成する |
| 関数 | `synthesizeVerificationResult` | 検証結果を統合する |
| 関数 | `getVerificationWorkflowRules` | ワークフールールを取得する |
| 関数 | `runMetacognitiveCheck` | - |
| 関数 | `detectInnerFascism` | - |
| 関数 | `detectBinaryOppositions` | - |
| 関数 | `parseInferenceChain` | 推論チェーンを解析する |
| 関数 | `detectAporiaAvoidanceTemptation` | - |
| 関数 | `generateMetacognitiveSummary` | - |
| 関数 | `generateImprovementActions` | メタ認知チェック結果から改善アクションを生成する |
| 関数 | `formatActionsAsPromptInstructions` | 改善アクションを実行可能なプロンプト指示に変換する |
| 関数 | `runIntegratedMetacognitiveAnalysis` | メタ認知チェックと改善アクションを統合的に実行 |
| 関数 | `generateActionsFromDetection` | 統合検出結果から改善アクションを生成（信頼度考慮版） |
| 関数 | `analyzeThinkingMode` | 思考モードを詳細に分析する |
| 関数 | `runIntegratedThinkingAnalysis` | 思考モード分析を統合メタ認知チェックに組み込む |
| 関数 | `extractCandidates` | 正規表現で候補を抽出する |
| 関数 | `applyContextFilter` | 候補にコンテキストフィルタを適用する |
| 関数 | `generateFilterStats` | フィルタリング統計を生成 |
| 関数 | `generateLLMVerificationPrompt` | LLM判定用のプロンプトを生成する |
| 関数 | `parseLLMVerificationResponse` | LLM判定結果をパースする |
| 関数 | `runIntegratedDetection` | 統合検出を実行（パターンマッチングのみ） |
| 関数 | `runLLMEnhancedDetection` | LLM拡張メタ認知チェックを実行 |
| 関数 | `assessDetectionUncertainty` | 検出の不確実性を評価する |
| 関数 | `generateUncertaintySummary` | 検出不確実性評価のサマリーを生成 |
| 関数 | `assessDystopianRisk` | 検出システムのディストピア的リスクを評価する |
| 関数 | `generateDystopianRiskSummary` | ディストピア的リスク評価のサマリーを生成 |
| インターフェース | `VerificationWorkflowConfig` | 検証ワークフローの設定 |
| インターフェース | `ChallengerConfig` | チャレンジャー設定インターフェース |
| インターフェース | `InspectorConfig` | 検査者の設定 |
| インターフェース | `VerificationResult` | 検証結果を表す |
| インターフェース | `InspectorOutput` | 検査官の結果出力を表す |
| インターフェース | `DetectedPattern` | 検出されたパターンを表す |
| インターフェース | `ChallengerOutput` | 検証の結果出力を表す |
| インターフェース | `ChallengedClaim` | 挑戦された主張を表す |
| インターフェース | `VerificationContext` | 検証のコンテキスト情報 |
| インターフェース | `BugHuntingAporiaRecognition` | アポリア認識結果 |
| インターフェース | `BugHuntingContext` | バグハンティングのコンテキスト |
| インターフェース | `DystopianTendencyDetection` | ディストピア傾向検出結果 |
| インターフェース | `UtopiaDystopiaAssessment` | ユートピア/ディストピア評価結果 |
| インターフェース | `DesirePatternDetection` | 欲望パターン検出結果 |
| インターフェース | `InnerFascismDetection` | 内なるファシズム検出結果（スキゾ分析版） |
| インターフェース | `SchizoAnalysisAssessment` | スキゾ分析評価結果 |
| インターフェース | `AporiaDetection` | アポリア検出結果 |
| インターフェース | `FallacyDetection` | 誤謬検出結果 |
| インターフェース | `MetacognitiveCheck` | メタ認知チェック結果 |
| インターフェース | `InferenceChain` | 推論チェーンを表すインターフェース |
| インターフェース | `InferenceStep` | 個別の推論ステップ |
| インターフェース | `ImprovementAction` | 改善アクションを表すインターフェース |
| インターフェース | `ThinkingModeAnalysis` | 思考モード分析結果 |
| インターフェース | `CandidateDetection` | 候補検出結果（正規表現ベース） |
| インターフェース | `LLMVerificationRequest` | LLM判定リクエスト |
| インターフェース | `LLMVerificationResult` | LLM判定結果 |
| インターフェース | `IntegratedVerificationResult` | 統合判定結果 |
| インターフェース | `DetectionUncertaintyAssessment` | 検出不確実性評価結果 |
| インターフェース | `DetectionLimitation` | 検出の限界を表す |
| インターフェース | `MissedIssueCandidate` | 見落とされた可能性のある問題 |
| インターフェース | `DystopianRiskAssessment` | ディストピア的リスク評価結果 |
| インターフェース | `DystopianPattern` | ディストピア的パターン |
| インターフェース | `LiberatingPossibility` | 解放的可能性 |
| 型 | `VerificationTriggerMode` | 検証トリガーのモード定義 |
| 型 | `FallbackBehavior` | フォールバック時の動作方針 |
| 型 | `ChallengeCategory` | チャレンジのカテゴリ |
| 型 | `SuspicionThreshold` | 疑わしさの閾値レベル |
| 型 | `InspectionPattern` | 検査パターン定義 |
| 型 | `VerificationVerdict` | 検証の最終判定結果 |
| 型 | `BugHuntingAporiaType` | アポリアタイプ（バグハンティング特化） |
| 型 | `DystopianTendencyType` | ディストピア傾向タイプ（全体主義的傾向の検出） |
| 型 | `DesirePatternType` | 欲望パターンタイプ（スキゾ分析） |
| 型 | `InnerFascismType` | 内なるファシズムパターンタイプ |
| 型 | `AporiaType` | アポリアタイプ |
| 型 | `ThinkingHat` | ド・ボノの6つの思考帽子 |
| 型 | `ThinkingSystem` | カーネマンの思考システム |
| 型 | `BloomLevel` | ブルームのタキソノミー（認知領域） |

## 図解

### クラス図

```mermaid
classDiagram
  class VerificationWorkflowConfig {
    <<interface>>
    +enabled: boolean
    +triggerModes: VerificationTriggerM
    +challengerConfig: ChallengerConfig
    +inspectorConfig: InspectorConfig
    +fallbackBehavior: FallbackBehavior
  }
  class ChallengerConfig {
    <<interface>>
    +minConfidenceToChallenge: number
    +requiredFlaws: number
    +enabledCategories: ChallengeCategory
  }
  class InspectorConfig {
    <<interface>>
    +suspicionThreshold: SuspicionThreshold
    +requiredPatterns: InspectionPattern
    +autoTriggerOnCollapseSignals: boolean
  }
  class VerificationResult {
    <<interface>>
    +triggered: boolean
    +triggerReason: string
    +inspectorOutput: InspectorOutput
    +challengerOutput: ChallengerOutput
    +finalVerdict: VerificationVerdict
  }
  class InspectorOutput {
    <<interface>>
    +suspicionLevel: SuspicionThreshold
    +detectedPatterns: DetectedPattern
    +summary: string
    +recommendation: string
  }
  class DetectedPattern {
    <<interface>>
    +pattern: InspectionPattern
    +location: string
    +severity: low_medium_high
    +description: string
  }
  class ChallengerOutput {
    <<interface>>
    +challengedClaims: ChallengedClaim
    +overallSeverity: minor_moderate
    +summary: string
    +suggestedRevisions: string
  }
  class ChallengedClaim {
    <<interface>>
    +claim: string
    +flaw: string
    +evidenceGap: string
    +alternative: string
    +boundaryFailure: string
  }
  class VerificationContext {
    <<interface>>
    +task: string
    +triggerMode: post_subagent_pos
    +agentId: string
    +teamId: string
    +previousVerifications: number
  }
  class BugHuntingAporiaRecognition {
    <<interface>>
    +aporiaType: BugHuntingAporiaType
    +pole1: concept_string_valu
    +pole2: concept_string_valu
    +tensionLevel: number
    +recommendedTilt: pole1_pole2_bal
  }
  class BugHuntingContext {
    <<interface>>
    +isProduction: boolean
    +isSecurityRelated: boolean
    +isRecurring: boolean
    +isFirstEncounter: boolean
    +isTeamInvestigation: boolean
  }
  class DystopianTendencyDetection {
    <<interface>>
    +tendencyType: DystopianTendencyTyp
    +severity: minor_moderate
    +description: string
    +evidence: string
    +counterAction: string
  }
  class UtopiaDystopiaAssessment {
    <<interface>>
    +dystopianTendencies: DystopianTendencyDet
    +healthyImperfectionIndicators: string
    +overallHealth: healthy_warning
    +recommendations: string
  }
  class DesirePatternDetection {
    <<interface>>
    +patternType: DesirePatternType
    +isProductive: boolean
    +description: string
    +evidence: string
    +transformation: string
  }
  class InnerFascismDetection {
    <<interface>>
    +fascismType: InnerFascismType
    +severity: minor_moderate
    +description: string
    +evidence: string
    +liberation: string
  }
  class SchizoAnalysisAssessment {
    <<interface>>
    +desirePatterns: DesirePatternDetecti
    +innerFascismPatterns: InnerFascismDetectio
    +productiveScore: number
    +repressionScore: number
    +liberationPoints: string
  }
  class AporiaDetection {
    <<interface>>
    +type: AporiaType
    +pole1: concept_string_valu
    +pole2: concept_string_valu
    +tensionLevel: number
    +description: string
  }
  class FallacyDetection {
    <<interface>>
    +type: string
    +location: string
    +description: string
    +correction: string
  }
  class MetacognitiveCheck {
    <<interface>>
    +deconstruction: binaryOppositions_s
    +schizoAnalysis: desireProduction_st
    +eudaimonia: excellencePursuit_s
    +utopiaDystopia: worldBeingCreated_s
    +philosophyOfThought: isThinking_boolean
  }
  class InferenceChain {
    <<interface>>
    +premises: string
    +steps: InferenceStep
    +conclusion: string
    +validity: valid_invalid_u
    +gaps: string
  }
  class InferenceStep {
    <<interface>>
    +stepNumber: number
    +input: string
    +inferenceType: deductive_inducti
    +output: string
    +isValid: boolean
  }
  class ImprovementAction {
    <<interface>>
    +category: deconstruction_sc
    +priority: T1_2_3_4_5
    +issue: string
    +action: string
    +expectedOutcome: string
  }
  class ThinkingModeAnalysis {
    <<interface>>
    +primaryHat: ThinkingHat
    +detectedHats: Array_hat_ThinkingH
    +thinkingSystem: ThinkingSystem
    +system2Indicators: string
    +bloomLevel: BloomLevel
  }
  class CandidateDetection {
    <<interface>>
    +type: string
    +matchedText: string
    +location: start_number_end_nu
    +context: string
    +patternConfidence: number
  }
  class LLMVerificationRequest {
    <<interface>>
    +candidate: CandidateDetection
    +fullText: string
    +taskContext: string
    +verificationType: fallacy_binary_op
  }
  class LLMVerificationResult {
    <<interface>>
    +candidate: CandidateDetection
    +verdict: confirmed_rejecte
    +confidence: number
    +reasoning: string
    +contextualFactors: string
  }
  class IntegratedVerificationResult {
    <<interface>>
    +candidates: CandidateDetection
    +llmResults: LLMVerificationResul
    +finalVerdict: confirmed_rejecte
    +overallConfidence: number
    +method: pattern_only_llm
  }
  class ExclusionRule {
    <<interface>>
    +name: string
    +targetType: string
    +condition: RegExp
    +reason: string
    +confidenceAdjustment: number
  }
  class ContextBoostRule {
    <<interface>>
    +name: string
    +targetType: string
    +condition: RegExp
    +reason: string
    +boost: number
  }
  class DetectionUncertaintyAssessment {
    <<interface>>
    +targetOutput: string
    +detectionSummary: claimResultMismatch
    +detectionLimitations: DetectionLimitation
    +negativeResultConfidence: number
    +alternativeFormatRisk: risk_number_possibl
  }
  class DetectionLimitation {
    <<interface>>
    +type: format_dependency
    +description: string
    +impact: number
    +mitigation: string
  }
  class MissedIssueCandidate {
    <<interface>>
    +issueType: string
    +reason: string
    +probability: number
    +howToVerify: string
  }
  class DystopianRiskAssessment {
    <<interface>>
    +subject: string
    +overallRisk: number
    +riskCategories: surve
    +dystopianPatterns: DystopianPattern
    +liberatingPossibilities: LiberatingPossibilit
  }
  class DystopianPattern {
    <<interface>>
    +name: string
    +type: panopticon_newspe
    +location: string
    +description: string
    +severity: number
  }
  class LiberatingPossibility {
    <<interface>>
    +name: string
    +description: string
    +howToRealize: string
    +expectedEffect: string
  }
```

### 関数フロー

```mermaid
flowchart TD
  analyzeDepthBreadthAporia["analyzeDepthBreadthAporia()"]
  analyzeHypothesisEvidenceAporia["analyzeHypothesisEvidenceAporia()"]
  analyzeSpeedCompletenessAporia["analyzeSpeedCompletenessAporia()"]
  checkOutputPatterns["checkOutputPatterns()"]
  detectClaimResultMismatch["detectClaimResultMismatch()"]
  detectConcretenessBias["detectConcretenessBias()"]
  detectConfirmationBias["detectConfirmationBias()"]
  detectContextBlindness["detectContextBlindness()"]
  detectDystopianTendencies["detectDystopianTendencies()"]
  detectFirstReasonStopping["detectFirstReasonStopping()"]
  detectHealthyImperfectionIndicators["detectHealthyImperfectionIndicators()"]
  detectHumanExclusion["detectHumanExclusion()"]
  detectMissingAlternatives["detectMissingAlternatives()"]
  detectOverMechanization["detectOverMechanization()"]
  detectOverconfidence["detectOverconfidence()"]
  detectPalliativeFix["detectPalliativeFix()"]
  detectProximityBias["detectProximityBias()"]
  detectResponsibilityDilution["detectResponsibilityDilution()"]
  evaluateAporiaHandling["evaluateAporiaHandling()"]
  extractKeyTerms["extractKeyTerms()"]
  isHighStakesTask["isHighStakesTask()"]
  recognizeBugHuntingAporias["recognizeBugHuntingAporias()"]
  resolveVerificationConfig["resolveVerificationConfig()"]
  shouldTriggerVerification["shouldTriggerVerification()"]
  detectClaimResultMismatch --> extractKeyTerms
  detectDystopianTendencies --> detectContextBlindness
  detectDystopianTendencies --> detectHumanExclusion
  detectDystopianTendencies --> detectOverMechanization
  detectDystopianTendencies --> detectResponsibilityDilution
  evaluateAporiaHandling --> recognizeBugHuntingAporias
  recognizeBugHuntingAporias --> analyzeDepthBreadthAporia
  recognizeBugHuntingAporias --> analyzeHypothesisEvidenceAporia
  recognizeBugHuntingAporias --> analyzeSpeedCompletenessAporia
  shouldTriggerVerification --> checkOutputPatterns
  shouldTriggerVerification --> isHighStakesTask
  shouldTriggerVerification --> resolveVerificationConfig
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant verification_workflow as "verification-workflow"

  Caller->>verification_workflow: shouldTriggerVerification()
  verification_workflow-->>Caller: trigger_boolean_rea

  Caller->>verification_workflow: detectClaimResultMismatch()
  verification_workflow-->>Caller: detected_boolean_re
```

## 関数

### shouldTriggerVerification

```typescript
shouldTriggerVerification(output: string, confidence: number, context: VerificationContext): { trigger: boolean; reason: string }
```

検証が必要か判断

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| confidence | `number` | はい |
| context | `VerificationContext` | はい |

**戻り値**: `{ trigger: boolean; reason: string }`

### checkOutputPatterns

```typescript
checkOutputPatterns(output: string, config: VerificationWorkflowConfig): { trigger: boolean; reason: string }
```

出力パターンをチェック

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| config | `VerificationWorkflowConfig` | はい |

**戻り値**: `{ trigger: boolean; reason: string }`

### detectClaimResultMismatch

```typescript
detectClaimResultMismatch(output: string): { detected: boolean; reason: string }
```

CLAIM-RESULT不一致を検出
単純な単語重複ではなく、意味的な構造を分析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### extractKeyTerms

```typescript
extractKeyTerms(text: string): string[]
```

テキストから重要な用語を抽出（簡易版）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `string[]`

### detectOverconfidence

```typescript
detectOverconfidence(output: string): { detected: boolean; reason: string }
```

過信を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### detectMissingAlternatives

```typescript
detectMissingAlternatives(output: string): { detected: boolean; reason: string }
```

代替解釈の欠如を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### detectConfirmationBias

```typescript
detectConfirmationBias(output: string): { detected: boolean; reason: string }
```

確認バイアスパターンを検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### isHighStakesTask

```typescript
isHighStakesTask(task: string): boolean
```

高リスクタスク判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |

**戻り値**: `boolean`

### detectFirstReasonStopping

```typescript
detectFirstReasonStopping(output: string): { detected: boolean; reason: string }
```

第1理由で探索停止を検出（バグハンティング）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### detectProximityBias

```typescript
detectProximityBias(output: string): { detected: boolean; reason: string }
```

近接性バイアスを検出（バグハンティング）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### detectConcretenessBias

```typescript
detectConcretenessBias(output: string): { detected: boolean; reason: string }
```

具体性バイアスを検出（バグハンティング）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### detectPalliativeFix

```typescript
detectPalliativeFix(output: string): { detected: boolean; reason: string }
```

対症療法的修正を検出（バグハンティング）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{ detected: boolean; reason: string }`

### recognizeBugHuntingAporias

```typescript
recognizeBugHuntingAporias(output: string, context: BugHuntingContext): BugHuntingAporiaRecognition[]
```

アポリアを認識し、推奨される傾きを算出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `BugHuntingContext` | はい |

**戻り値**: `BugHuntingAporiaRecognition[]`

### analyzeSpeedCompletenessAporia

```typescript
analyzeSpeedCompletenessAporia(output: string, context: BugHuntingContext): BugHuntingAporiaRecognition | null
```

速度 vs 完全性のアポリアを分析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `BugHuntingContext` | はい |

**戻り値**: `BugHuntingAporiaRecognition | null`

### analyzeHypothesisEvidenceAporia

```typescript
analyzeHypothesisEvidenceAporia(output: string, context: BugHuntingContext): BugHuntingAporiaRecognition | null
```

仮説駆動 vs 証拠駆動のアポリアを分析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `BugHuntingContext` | はい |

**戻り値**: `BugHuntingAporiaRecognition | null`

### analyzeDepthBreadthAporia

```typescript
analyzeDepthBreadthAporia(output: string, context: BugHuntingContext): BugHuntingAporiaRecognition | null
```

深さ vs 幅のアポリアを分析

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `BugHuntingContext` | はい |

**戻り値**: `BugHuntingAporiaRecognition | null`

### evaluateAporiaHandling

```typescript
evaluateAporiaHandling(output: string, context: BugHuntingContext): {
  aporias: BugHuntingAporiaRecognition[];
  overallAssessment: string;
  recommendations: string[];
  warnings: string[];
}
```

アポリア対処の包括的評価を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `BugHuntingContext` | はい |

**戻り値**: `{
  aporias: BugHuntingAporiaRecognition[];
  overallAssessment: string;
  recommendations: string[];
  warnings: string[];
}`

### detectDystopianTendencies

```typescript
detectDystopianTendencies(output: string, processApplied?: string): DystopianTendencyDetection[]
```

ディストピア傾向を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| processApplied | `string` | いいえ |

**戻り値**: `DystopianTendencyDetection[]`

### detectOverMechanization

```typescript
detectOverMechanization(output: string, processApplied?: string): DystopianTendencyDetection | null
```

過度な機械化を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| processApplied | `string` | いいえ |

**戻り値**: `DystopianTendencyDetection | null`

### detectHumanExclusion

```typescript
detectHumanExclusion(output: string): DystopianTendencyDetection | null
```

人間性の排除を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DystopianTendencyDetection | null`

### detectContextBlindness

```typescript
detectContextBlindness(output: string, processApplied?: string): DystopianTendencyDetection | null
```

文脈の無視を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| processApplied | `string` | いいえ |

**戻り値**: `DystopianTendencyDetection | null`

### detectResponsibilityDilution

```typescript
detectResponsibilityDilution(output: string): DystopianTendencyDetection | null
```

責任の希薄化を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DystopianTendencyDetection | null`

### findRepeatedPhrases

```typescript
findRepeatedPhrases(text: string, minLength: number): string[]
```

繰り返しフレーズを検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| minLength | `number` | はい |

**戻り値**: `string[]`

### detectHealthyImperfectionIndicators

```typescript
detectHealthyImperfectionIndicators(output: string): string[]
```

健全な不完全さの指標を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `string[]`

### assessUtopiaDystopiaBalance

```typescript
assessUtopiaDystopiaBalance(output: string, processApplied?: string): UtopiaDystopiaAssessment
```

ユートピア/ディストピア評価を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| processApplied | `string` | いいえ |

**戻り値**: `UtopiaDystopiaAssessment`

### detectDesirePatterns

```typescript
detectDesirePatterns(output: string): DesirePatternDetection[]
```

欲望パターンを検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DesirePatternDetection[]`

### detectProductiveCuriosity

```typescript
detectProductiveCuriosity(output: string): DesirePatternDetection | null
```

生産的好奇心を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DesirePatternDetection | null`

### detectGuiltDrivenSearch

```typescript
detectGuiltDrivenSearch(output: string): DesirePatternDetection | null
```

罪悪感駆動の探索を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DesirePatternDetection | null`

### detectNormObedience

```typescript
detectNormObedience(output: string): DesirePatternDetection | null
```

規範への服従を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DesirePatternDetection | null`

### detectHierarchyReproduction

```typescript
detectHierarchyReproduction(output: string): DesirePatternDetection | null
```

階層の再生産を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DesirePatternDetection | null`

### detectInnerFascismPatterns

```typescript
detectInnerFascismPatterns(output: string): InnerFascismDetection[]
```

内なるファシズムパターンを検出（スキゾ分析版）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `InnerFascismDetection[]`

### detectSelfSurveillance

```typescript
detectSelfSurveillance(output: string): InnerFascismDetection | null
```

自己監視を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `InnerFascismDetection | null`

### detectNormInternalization

```typescript
detectNormInternalization(output: string): InnerFascismDetection | null
```

規範の内面化を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `InnerFascismDetection | null`

### detectImpossibilityRepression

```typescript
detectImpossibilityRepression(output: string): InnerFascismDetection | null
```

不可能性の抑圧を検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `InnerFascismDetection | null`

### performSchizoAnalysis

```typescript
performSchizoAnalysis(output: string): SchizoAnalysisAssessment
```

スキゾ分析評価を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `SchizoAnalysisAssessment`

### resolveVerificationConfig

```typescript
resolveVerificationConfig(): VerificationWorkflowConfig
```

検証設定を解決

**戻り値**: `VerificationWorkflowConfig`

### buildInspectorPrompt

```typescript
buildInspectorPrompt(targetOutput: string, context: VerificationContext): string
```

検査用プロンプトを構築

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| targetOutput | `string` | はい |
| context | `VerificationContext` | はい |

**戻り値**: `string`

### buildChallengerPrompt

```typescript
buildChallengerPrompt(targetOutput: string, context: VerificationContext): string
```

挑戦者用プロンプトを作成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| targetOutput | `string` | はい |
| context | `VerificationContext` | はい |

**戻り値**: `string`

### synthesizeVerificationResult

```typescript
synthesizeVerificationResult(originalOutput: string, originalConfidence: number, inspectorOutput: InspectorOutput | undefined, challengerOutput: ChallengerOutput | undefined, context: VerificationContext): VerificationResult
```

検証結果を統合する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| originalOutput | `string` | はい |
| originalConfidence | `number` | はい |
| inspectorOutput | `InspectorOutput | undefined` | はい |
| challengerOutput | `ChallengerOutput | undefined` | はい |
| context | `VerificationContext` | はい |

**戻り値**: `VerificationResult`

### formatPatternName

```typescript
formatPatternName(pattern: InspectionPattern): string
```

パターン名をフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| pattern | `InspectionPattern` | はい |

**戻り値**: `string`

### formatCategoryName

```typescript
formatCategoryName(category: ChallengeCategory): string
```

カテゴリ名をフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| category | `ChallengeCategory` | はい |

**戻り値**: `string`

### getVerificationWorkflowRules

```typescript
getVerificationWorkflowRules(): string
```

ワークフールールを取得する

**戻り値**: `string`

### runMetacognitiveCheck

```typescript
runMetacognitiveCheck(output: string, context: { task?: string; currentMode?: string }): MetacognitiveCheck
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |
| &nbsp;&nbsp;↳ currentMode | `string` | いいえ |

**戻り値**: `MetacognitiveCheck`

### detectInnerFascism

```typescript
detectInnerFascism(output: string, context: { task?: string; currentMode?: string }): MetacognitiveCheck['schizoAnalysis']
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |
| &nbsp;&nbsp;↳ currentMode | `string` | いいえ |

**戻り値**: `MetacognitiveCheck['schizoAnalysis']`

### detectBinaryOppositions

```typescript
detectBinaryOppositions(output: string, context: string): MetacognitiveCheck['deconstruction']
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `string` | はい |

**戻り値**: `MetacognitiveCheck['deconstruction']`

### evaluateEudaimonia

```typescript
evaluateEudaimonia(output: string, context: { task?: string; currentMode?: string }): MetacognitiveCheck['eudaimonia']
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |
| &nbsp;&nbsp;↳ currentMode | `string` | いいえ |

**戻り値**: `MetacognitiveCheck['eudaimonia']`

### analyzeWorldCreation

```typescript
analyzeWorldCreation(output: string): MetacognitiveCheck['utopiaDystopia']
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `MetacognitiveCheck['utopiaDystopia']`

### assessThinkingQuality

```typescript
assessThinkingQuality(output: string, context: { task?: string; currentMode?: string }): MetacognitiveCheck['philosophyOfThought']
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |
| &nbsp;&nbsp;↳ currentMode | `string` | いいえ |

**戻り値**: `MetacognitiveCheck['philosophyOfThought']`

### evaluateThinkingMode

```typescript
evaluateThinkingMode(output: string, context: { task?: string; currentMode?: string }): MetacognitiveCheck['taxonomyOfThought']
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |
| &nbsp;&nbsp;↳ currentMode | `string` | いいえ |

**戻り値**: `MetacognitiveCheck['taxonomyOfThought']`

### detectFallacies

```typescript
detectFallacies(output: string): MetacognitiveCheck['logic']
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `MetacognitiveCheck['logic']`

### parseInferenceChain

```typescript
parseInferenceChain(output: string): InferenceChain
```

推論チェーンを解析する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `InferenceChain`

### detectAporiaAvoidanceTemptation

```typescript
detectAporiaAvoidanceTemptation(aporias: AporiaDetection[], output: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| aporias | `AporiaDetection[]` | はい |
| output | `string` | はい |

**戻り値**: `string[]`

### generateMetacognitiveSummary

```typescript
generateMetacognitiveSummary(check: MetacognitiveCheck): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| check | `MetacognitiveCheck` | はい |

**戻り値**: `string`

### generateImprovementActions

```typescript
generateImprovementActions(check: MetacognitiveCheck): ImprovementAction[]
```

メタ認知チェック結果から改善アクションを生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| check | `MetacognitiveCheck` | はい |

**戻り値**: `ImprovementAction[]`

### formatActionsAsPromptInstructions

```typescript
formatActionsAsPromptInstructions(actions: ImprovementAction[], maxActions: number): string
```

改善アクションを実行可能なプロンプト指示に変換する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| actions | `ImprovementAction[]` | はい |
| maxActions | `number` | はい |

**戻り値**: `string`

### runIntegratedMetacognitiveAnalysis

```typescript
runIntegratedMetacognitiveAnalysis(output: string, context: { task?: string; currentMode?: string }): {
  check: MetacognitiveCheck;
  actions: ImprovementAction[];
  promptInstructions: string;
  summary: string;
  depthScore: number;
}
```

メタ認知チェックと改善アクションを統合的に実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |
| &nbsp;&nbsp;↳ currentMode | `string` | いいえ |

**戻り値**: `{
  check: MetacognitiveCheck;
  actions: ImprovementAction[];
  promptInstructions: string;
  summary: string;
  depthScore: number;
}`

### calculateDepthScore

```typescript
calculateDepthScore(check: MetacognitiveCheck): number
```

推論深度スコアを計算（内部関数）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| check | `MetacognitiveCheck` | はい |

**戻り値**: `number`

### getConfidenceLevel

```typescript
getConfidenceLevel(confidence: number): ConfidenceLevel
```

候補検出結果から信頼度レベルを判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| confidence | `number` | はい |

**戻り値**: `ConfidenceLevel`

### generateActionsFromDetection

```typescript
generateActionsFromDetection(detectionResult: IntegratedVerificationResult): Array<ImprovementAction & { confidenceLevel: ConfidenceLevel }>
```

統合検出結果から改善アクションを生成（信頼度考慮版）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| detectionResult | `IntegratedVerificationResult` | はい |

**戻り値**: `Array<ImprovementAction & { confidenceLevel: ConfidenceLevel }>`

### getActionTemplateForType

```typescript
getActionTemplateForType(type: string, matchedText: string): {
  issuePrefix: string;
  action: string;
  expectedOutcome: string;
  perspective: string;
}
```

検出タイプに応じたアクションテンプレートを取得

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |
| matchedText | `string` | はい |

**戻り値**: `{
  issuePrefix: string;
  action: string;
  expectedOutcome: string;
  perspective: string;
}`

### mapTypeToCategory

```typescript
mapTypeToCategory(type: string): ImprovementAction['category']
```

検出タイプをカテゴリにマッピング

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `ImprovementAction['category']`

### analyzeThinkingMode

```typescript
analyzeThinkingMode(text: string, context: { task?: string }): ThinkingModeAnalysis
```

思考モードを詳細に分析する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |

**戻り値**: `ThinkingModeAnalysis`

### calculateThinkingDepthScore

```typescript
calculateThinkingDepthScore(text: string, system2Score: number, bloomProgression: Record<BloomLevel, boolean>): number
```

思考の深さスコアを計算（思考分類学用）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| system2Score | `number` | はい |
| bloomProgression | `Record<BloomLevel, boolean>` | はい |

**戻り値**: `number`

### calculateDiversityScore

```typescript
calculateDiversityScore(detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }>): number
```

思考の多様性スコアを計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| detectedHats | `Array<{ hat: ThinkingHat; evidence: string; con...` | はい |

**戻り値**: `number`

### calculateCoherenceScore

```typescript
calculateCoherenceScore(text: string): number
```

思考の一貫性スコアを計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |

**戻り値**: `number`

### determineRecommendedMode

```typescript
determineRecommendedMode(task: string | undefined, currentHat: ThinkingHat, currentSystem: ThinkingSystem, currentBloom: BloomLevel, depthScore: number): { recommendedMode: string; recommendationReason: string }
```

推奨モードを決定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string | undefined` | はい |
| currentHat | `ThinkingHat` | はい |
| currentSystem | `ThinkingSystem` | はい |
| currentBloom | `BloomLevel` | はい |
| depthScore | `number` | はい |

**戻り値**: `{ recommendedMode: string; recommendationReason: string }`

### runIntegratedThinkingAnalysis

```typescript
runIntegratedThinkingAnalysis(text: string, context: { task?: string }): {
  modeAnalysis: ThinkingModeAnalysis;
  issues: string[];
  recommendations: string[];
  overallScore: number;
}
```

思考モード分析を統合メタ認知チェックに組み込む

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |

**戻り値**: `{
  modeAnalysis: ThinkingModeAnalysis;
  issues: string[];
  recommendations: string[];
  overallScore: number;
}`

### extractCandidates

```typescript
extractCandidates(text: string, patterns: Array<{ pattern: RegExp; type: string; confidence: number }>, contextRadius: number): CandidateDetection[]
```

正規表現で候補を抽出する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| patterns | `Array<{ pattern: RegExp; type: string; confiden...` | はい |
| contextRadius | `number` | はい |

**戻り値**: `CandidateDetection[]`

### applyContextFilter

```typescript
applyContextFilter(candidates: CandidateDetection[], fullText: string): CandidateDetection[]
```

候補にコンテキストフィルタを適用する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| candidates | `CandidateDetection[]` | はい |
| fullText | `string` | はい |

**戻り値**: `CandidateDetection[]`

### generateFilterStats

```typescript
generateFilterStats(original: number, filtered: CandidateDetection[]): {
  originalCount: number;
  filteredCount: number;
  excludedCount: number;
  avgConfidence: number;
  confidenceDistribution: { high: number; medium: number; low: number };
}
```

フィルタリング統計を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| original | `number` | はい |
| filtered | `CandidateDetection[]` | はい |

**戻り値**: `{
  originalCount: number;
  filteredCount: number;
  excludedCount: number;
  avgConfidence: number;
  confidenceDistribution: { high: number; medium: number; low: number };
}`

### generateLLMVerificationPrompt

```typescript
generateLLMVerificationPrompt(request: LLMVerificationRequest): string
```

LLM判定用のプロンプトを生成する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| request | `LLMVerificationRequest` | はい |

**戻り値**: `string`

### parseLLMVerificationResponse

```typescript
parseLLMVerificationResponse(response: string, candidate: CandidateDetection): LLMVerificationResult
```

LLM判定結果をパースする

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| response | `string` | はい |
| candidate | `CandidateDetection` | はい |

**戻り値**: `LLMVerificationResult`

### runIntegratedDetection

```typescript
runIntegratedDetection(text: string, options: {
    detectFallacies?: boolean;
    detectBinaryOppositions?: boolean;
    detectFascism?: boolean;
    detectCravings?: boolean;
    minPatternConfidence?: number;
    /** コンテキストフィルタを適用するか */
    applyFilter?: boolean;
  }): IntegratedVerificationResult
```

統合検出を実行（パターンマッチングのみ）

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| options | `object` | はい |
| &nbsp;&nbsp;↳ detectFallacies | `boolean` | いいえ |
| &nbsp;&nbsp;↳ detectBinaryOppositions | `boolean` | いいえ |
| &nbsp;&nbsp;↳ detectFascism | `boolean` | いいえ |
| &nbsp;&nbsp;↳ detectCravings | `boolean` | いいえ |
| &nbsp;&nbsp;↳ minPatternConfidence | `number` | いいえ |
| &nbsp;&nbsp;↳ applyFilter | `boolean` | いいえ |

**戻り値**: `IntegratedVerificationResult`

### runLLMEnhancedDetection

```typescript
async runLLMEnhancedDetection(text: string, llmVerifyFunction: (prompt: string) => Promise<string>, context: { task?: string; skipPatternsWithHighConfidence?: boolean }): Promise<IntegratedVerificationResult>
```

LLM拡張メタ認知チェックを実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| text | `string` | はい |
| llmVerifyFunction | `(prompt: string) => Promise<string>` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ task | `string` | いいえ |
| &nbsp;&nbsp;↳ skipPatternsWithHighConfidence | `boolean` | いいえ |

**戻り値**: `Promise<IntegratedVerificationResult>`

### mapTypeToVerificationType

```typescript
mapTypeToVerificationType(type: string): LLMVerificationRequest['verificationType']
```

検出タイプを判定タイプにマッピング

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| type | `string` | はい |

**戻り値**: `LLMVerificationRequest['verificationType']`

### assessDetectionUncertainty

```typescript
assessDetectionUncertainty(output: string, detectionResults?: {
    claimResultMismatch?: { detected: boolean; reason: string };
    overconfidence?: { detected: boolean; reason: string };
    missingAlternatives?: { detected: boolean; reason: string };
    confirmationBias?: { detected: boolean; reason: string };
  }): DetectionUncertaintyAssessment
```

検出の不確実性を評価する
「何が検出されなかったか」を認識する能力の実装

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| detectionResults | `object` | いいえ |
| &nbsp;&nbsp;↳ claimResultMismatch | `{ detected: boolean; reason: string }` | いいえ |
| &nbsp;&nbsp;↳ overconfidence | `{ detected: boolean; reason: string }` | いいえ |
| &nbsp;&nbsp;↳ missingAlternatives | `{ detected: boolean; reason: string }` | いいえ |
| &nbsp;&nbsp;↳ confirmationBias | `{ detected: boolean; reason: string }` | いいえ |

**戻り値**: `DetectionUncertaintyAssessment`

### assessClaimResultDetectionConfidence

```typescript
assessClaimResultDetectionConfidence(output: string): number
```

CLAIM-RESULT検出の信頼度を評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `number`

### assessOverconfidenceDetectionConfidence

```typescript
assessOverconfidenceDetectionConfidence(output: string): number
```

過信検出の信頼度を評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `number`

### assessAlternativesDetectionConfidence

```typescript
assessAlternativesDetectionConfidence(output: string): number
```

代替解釈欠如検出の信頼度を評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `number`

### assessBiasDetectionConfidence

```typescript
assessBiasDetectionConfidence(output: string): number
```

確認バイアス検出の信頼度を評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `number`

### identifyDetectionLimitations

```typescript
identifyDetectionLimitations(output: string): DetectionLimitation[]
```

検出の限界を特定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `DetectionLimitation[]`

### assessAlternativeFormatRisk

```typescript
assessAlternativeFormatRisk(output: string): {
  risk: number;
  possibleFormats: string[];
  reason: string;
}
```

代替形式リスクを評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `{
  risk: number;
  possibleFormats: string[];
  reason: string;
}`

### identifyPotentiallyMissedIssues

```typescript
identifyPotentiallyMissedIssues(output: string, detectionStatus: { claimResult: boolean; overconfidence: boolean; alternatives: boolean; bias: boolean }, limitations: DetectionLimitation[]): MissedIssueCandidate[]
```

見落とされた可能性のある問題を特定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| detectionStatus | `object` | はい |
| &nbsp;&nbsp;↳ claimResult | `boolean` | はい |
| &nbsp;&nbsp;↳ overconfidence | `boolean` | はい |
| &nbsp;&nbsp;↳ alternatives | `boolean` | はい |
| &nbsp;&nbsp;↳ bias | `boolean` | はい |
| limitations | `DetectionLimitation[]` | はい |

**戻り値**: `MissedIssueCandidate[]`

### calculateNegativeResultConfidence

```typescript
calculateNegativeResultConfidence(output: string, detectionConfidences: { claimResult: number; overconfidence: number; alternatives: number; bias: number }, limitations: DetectionLimitation[], alternativeFormatRisk: { risk: number }): number
```

「検出なし」への信頼度を計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| detectionConfidences | `object` | はい |
| &nbsp;&nbsp;↳ claimResult | `number` | はい |
| &nbsp;&nbsp;↳ overconfidence | `number` | はい |
| &nbsp;&nbsp;↳ alternatives | `number` | はい |
| &nbsp;&nbsp;↳ bias | `number` | はい |
| limitations | `DetectionLimitation[]` | はい |
| alternativeFormatRisk | `object` | はい |
| &nbsp;&nbsp;↳ risk | `number` | はい |

**戻り値**: `number`

### generateRecommendedAdditionalChecks

```typescript
generateRecommendedAdditionalChecks(limitations: DetectionLimitation[], potentiallyMissed: MissedIssueCandidate[], alternativeFormatRisk: { risk: number; possibleFormats: string[] }): string[]
```

推奨される追加検証を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| limitations | `DetectionLimitation[]` | はい |
| potentiallyMissed | `MissedIssueCandidate[]` | はい |
| alternativeFormatRisk | `object` | はい |
| &nbsp;&nbsp;↳ risk | `number` | はい |
| &nbsp;&nbsp;↳ possibleFormats | `string[]` | はい |

**戻り値**: `string[]`

### generateUncertaintySummary

```typescript
generateUncertaintySummary(assessment: DetectionUncertaintyAssessment): string
```

検出不確実性評価のサマリーを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| assessment | `DetectionUncertaintyAssessment` | はい |

**戻り値**: `string`

### assessDystopianRisk

```typescript
assessDystopianRisk(detectionOutput: string, context: {
    detectionCount?: number;
    warningCount?: number;
    blockedCount?: number;
    falsePositiveRate?: number;
    recentDetections?: string[];
  }): DystopianRiskAssessment
```

検出システムのディストピア的リスクを評価する

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| detectionOutput | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ detectionCount | `number` | いいえ |
| &nbsp;&nbsp;↳ warningCount | `number` | いいえ |
| &nbsp;&nbsp;↳ blockedCount | `number` | いいえ |
| &nbsp;&nbsp;↳ falsePositiveRate | `number` | いいえ |
| &nbsp;&nbsp;↳ recentDetections | `string[]` | いいえ |

**戻り値**: `DystopianRiskAssessment`

### assessSurveillanceInternalization

```typescript
assessSurveillanceInternalization(output: string, context: { detectionCount?: number; warningCount?: number }): { score: number; indicators: string[]; description: string }
```

監視の内面化リスクを評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ detectionCount | `number` | いいえ |
| &nbsp;&nbsp;↳ warningCount | `number` | いいえ |

**戻り値**: `{ score: number; indicators: string[]; description: string }`

### assessCorrectAgentProduction

```typescript
assessCorrectAgentProduction(output: string, _context: object): { score: number; indicators: string[]; description: string }
```

「正しいエージェント」の生産リスクを評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| _context | `object` | はい |

**戻り値**: `{ score: number; indicators: string[]; description: string }`

### assessLastManProduction

```typescript
assessLastManProduction(output: string, _context: object): { score: number; indicators: string[]; description: string }
```

「最後の人間」の生産リスクを評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| _context | `object` | はい |

**戻り値**: `{ score: number; indicators: string[]; description: string }`

### assessOtherExclusion

```typescript
assessOtherExclusion(output: string, _context: object): { score: number; indicators: string[]; description: string }
```

他者排除リスクを評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| _context | `object` | はい |

**戻り値**: `{ score: number; indicators: string[]; description: string }`

### assessOverDetectionChilling

```typescript
assessOverDetectionChilling(output: string, context: { falsePositiveRate?: number; detectionCount?: number }): { score: number; indicators: string[]; description: string }
```

過剰検出による委縮リスクを評価

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| context | `object` | はい |
| &nbsp;&nbsp;↳ falsePositiveRate | `number` | いいえ |
| &nbsp;&nbsp;↳ detectionCount | `number` | いいえ |

**戻り値**: `{ score: number; indicators: string[]; description: string }`

### detectDystopianPatterns

```typescript
detectDystopianPatterns(output: string, _context: object): DystopianPattern[]
```

ディストピア的パターンを検出

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |
| _context | `object` | はい |

**戻り値**: `DystopianPattern[]`

### identifyLiberatingPossibilities

```typescript
identifyLiberatingPossibilities(output: string): LiberatingPossibility[]
```

解放的可能性を特定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| output | `string` | はい |

**戻り値**: `LiberatingPossibility[]`

### calculateOverallDystopianRisk

```typescript
calculateOverallDystopianRisk(surveillance: number, correctAgent: number, lastMan: number, exclusion: number, chilling: number): number
```

全体リスクを計算

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| surveillance | `number` | はい |
| correctAgent | `number` | はい |
| lastMan | `number` | はい |
| exclusion | `number` | はい |
| chilling | `number` | はい |

**戻り値**: `number`

### generateDystopianRiskRecommendations

```typescript
generateDystopianRiskRecommendations(surveillance: { score: number; indicators: string[] }, correctAgent: { score: number; indicators: string[] }, lastMan: { score: number; indicators: string[] }, exclusion: { score: number; indicators: string[] }, chilling: { score: number; indicators: string[] }, patterns: DystopianPattern[]): string[]
```

推奨事項を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| surveillance | `object` | はい |
| &nbsp;&nbsp;↳ score | `number` | はい |
| &nbsp;&nbsp;↳ indicators | `string[]` | はい |
| correctAgent | `object` | はい |
| &nbsp;&nbsp;↳ score | `number` | はい |
| &nbsp;&nbsp;↳ indicators | `string[]` | はい |
| lastMan | `object` | はい |
| &nbsp;&nbsp;↳ score | `number` | はい |
| &nbsp;&nbsp;↳ indicators | `string[]` | はい |
| exclusion | `object` | はい |
| &nbsp;&nbsp;↳ score | `number` | はい |
| &nbsp;&nbsp;↳ indicators | `string[]` | はい |
| chilling | `object` | はい |
| &nbsp;&nbsp;↳ score | `number` | はい |
| &nbsp;&nbsp;↳ indicators | `string[]` | はい |
| patterns | `DystopianPattern[]` | はい |

**戻り値**: `string[]`

### generateMindfulnessTransformation

```typescript
generateMindfulnessTransformation(overallRisk: number, patterns: DystopianPattern[], possibilities: LiberatingPossibility[]): string
```

気づきの姿勢への転換提案を生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| overallRisk | `number` | はい |
| patterns | `DystopianPattern[]` | はい |
| possibilities | `LiberatingPossibility[]` | はい |

**戻り値**: `string`

### generateDystopianRiskSummary

```typescript
generateDystopianRiskSummary(assessment: DystopianRiskAssessment): string
```

ディストピア的リスク評価のサマリーを生成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| assessment | `DystopianRiskAssessment` | はい |

**戻り値**: `string`

## インターフェース

### VerificationWorkflowConfig

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

検証ワークフローの設定

### ChallengerConfig

```typescript
interface ChallengerConfig {
  minConfidenceToChallenge: number;
  requiredFlaws: number;
  enabledCategories: ChallengeCategory[];
}
```

チャレンジャー設定インターフェース

### InspectorConfig

```typescript
interface InspectorConfig {
  suspicionThreshold: SuspicionThreshold;
  requiredPatterns: InspectionPattern[];
  autoTriggerOnCollapseSignals: boolean;
}
```

検査者の設定

### VerificationResult

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

検証結果を表す

### InspectorOutput

```typescript
interface InspectorOutput {
  suspicionLevel: SuspicionThreshold;
  detectedPatterns: DetectedPattern[];
  summary: string;
  recommendation: string;
}
```

検査官の結果出力を表す

### DetectedPattern

```typescript
interface DetectedPattern {
  pattern: InspectionPattern;
  location: string;
  severity: "low" | "medium" | "high";
  description: string;
}
```

検出されたパターンを表す

### ChallengerOutput

```typescript
interface ChallengerOutput {
  challengedClaims: ChallengedClaim[];
  overallSeverity: "minor" | "moderate" | "critical";
  summary: string;
  suggestedRevisions: string[];
}
```

検証の結果出力を表す

### ChallengedClaim

```typescript
interface ChallengedClaim {
  claim: string;
  flaw: string;
  evidenceGap: string;
  alternative: string;
  boundaryFailure?: string;
  severity: "minor" | "moderate" | "critical";
}
```

挑戦された主張を表す

### VerificationContext

```typescript
interface VerificationContext {
  task: string;
  triggerMode: "post-subagent" | "post-team" | "explicit" | "low-confidence" | "high-stakes";
  agentId?: string;
  teamId?: string;
  previousVerifications?: number;
}
```

検証のコンテキスト情報

### BugHuntingAporiaRecognition

```typescript
interface BugHuntingAporiaRecognition {
  aporiaType: BugHuntingAporiaType;
  pole1: {
    concept: string;
    value: string;
    indicators: string[];
  };
  pole2: {
    concept: string;
    value: string;
    indicators: string[];
  };
  tensionLevel: number;
  recommendedTilt: "pole1" | "pole2" | "balanced";
  tiltRationale: string;
  contextFactors: string[];
}
```

アポリア認識結果

### BugHuntingContext

```typescript
interface BugHuntingContext {
  isProduction: boolean;
  isSecurityRelated: boolean;
  isRecurring: boolean;
  isFirstEncounter: boolean;
  isTeamInvestigation: boolean;
  timeConstraint: "urgent" | "moderate" | "relaxed";
  impactLevel: "critical" | "high" | "medium" | "low";
}
```

バグハンティングのコンテキスト

### DystopianTendencyDetection

```typescript
interface DystopianTendencyDetection {
  tendencyType: DystopianTendencyType;
  severity: "minor" | "moderate" | "critical";
  description: string;
  evidence: string[];
  counterAction: string;
}
```

ディストピア傾向検出結果

### UtopiaDystopiaAssessment

```typescript
interface UtopiaDystopiaAssessment {
  dystopianTendencies: DystopianTendencyDetection[];
  healthyImperfectionIndicators: string[];
  overallHealth: "healthy" | "warning" | "critical";
  recommendations: string[];
}
```

ユートピア/ディストピア評価結果

### DesirePatternDetection

```typescript
interface DesirePatternDetection {
  patternType: DesirePatternType;
  isProductive: boolean;
  description: string;
  evidence: string[];
  transformation: string;
}
```

欲望パターン検出結果

### InnerFascismDetection

```typescript
interface InnerFascismDetection {
  fascismType: InnerFascismType;
  severity: "minor" | "moderate" | "severe";
  description: string;
  evidence: string[];
  liberation: string;
}
```

内なるファシズム検出結果（スキゾ分析版）

### SchizoAnalysisAssessment

```typescript
interface SchizoAnalysisAssessment {
  desirePatterns: DesirePatternDetection[];
  innerFascismPatterns: InnerFascismDetection[];
  productiveScore: number;
  repressionScore: number;
  liberationPoints: string[];
}
```

スキゾ分析評価結果

### AporiaDetection

```typescript
interface AporiaDetection {
  type: AporiaType;
  pole1: {
    concept: string;
    value: string;
    arguments: string[];
  };
  pole2: {
    concept: string;
    value: string;
    arguments: string[];
  };
  tensionLevel: number;
  description: string;
  context: string;
  resolution: 'maintain-tension' | 'acknowledge' | 'decide-with-uncertainty';
}
```

アポリア検出結果

### FallacyDetection

```typescript
interface FallacyDetection {
  type: string;
  location: string;
  description: string;
  correction: string;
}
```

誤謬検出結果

### MetacognitiveCheck

```typescript
interface MetacognitiveCheck {
  deconstruction: {
    binaryOppositions: string[];
    exclusions: string[];
    aporias: AporiaDetection[];
  };
  schizoAnalysis: {
    desireProduction: string[];
    innerFascismSigns: string[];
    microFascisms: string[];
  };
  eudaimonia: {
    excellencePursuit: string;
    pleasureTrap: boolean;
    meaningfulGrowth: string;
  };
  utopiaDystopia: {
    worldBeingCreated: string;
    totalitarianRisk: string[];
    powerDynamics: string[];
  };
  philosophyOfThought: {
    isThinking: boolean;
    metacognitionLevel: number;
    autopilotSigns: string[];
  };
  taxonomyOfThought: {
    currentMode: string;
    recommendedMode: string;
    modeRationale: string;
  };
  logic: {
    fallacies: FallacyDetection[];
    validInferences: string[];
    invalidInferences: string[];
    /** 推論チェーン解析結果 */
    inferenceChain?: InferenceChain;
  };
}
```

メタ認知チェック結果

### InferenceChain

```typescript
interface InferenceChain {
  premises: string[];
  steps: InferenceStep[];
  conclusion: string;
  validity: 'valid' | 'invalid' | 'uncertain';
  gaps: string[];
}
```

推論チェーンを表すインターフェース

### InferenceStep

```typescript
interface InferenceStep {
  stepNumber: number;
  input: string;
  inferenceType: 'deductive' | 'inductive' | 'abductive' | 'analogical' | 'unknown';
  output: string;
  isValid: boolean;
  justification?: string;
}
```

個別の推論ステップ

### ImprovementAction

```typescript
interface ImprovementAction {
  category: 'deconstruction' | 'schizoanalysis' | 'eudaimonia' | 'utopia_dystopia' | 
            'philosophy_of_thought' | 'taxonomy_of_thought' | 'logic';
  priority: 1 | 2 | 3 | 4 | 5;
  issue: string;
  action: string;
  expectedOutcome: string;
  relatedPerspective: string;
}
```

改善アクションを表すインターフェース

### ThinkingModeAnalysis

```typescript
interface ThinkingModeAnalysis {
  primaryHat: ThinkingHat;
  detectedHats: Array<{ hat: ThinkingHat; evidence: string; confidence: number }>;
  thinkingSystem: ThinkingSystem;
  system2Indicators: string[];
  bloomLevel: BloomLevel;
  bloomProgression: Record<BloomLevel, boolean>;
  depthScore: number;
  diversityScore: number;
  coherenceScore: number;
  recommendedMode: string;
  recommendationReason: string;
}
```

思考モード分析結果

### CandidateDetection

```typescript
interface CandidateDetection {
  type: string;
  matchedText: string;
  location: { start: number; end: number };
  context: string;
  patternConfidence: number;
}
```

候補検出結果（正規表現ベース）

### LLMVerificationRequest

```typescript
interface LLMVerificationRequest {
  candidate: CandidateDetection;
  fullText: string;
  taskContext?: string;
  verificationType: 'fallacy' | 'binary_opposition' | 'aporia' | 'fascism' | 'reasoning_gap';
}
```

LLM判定リクエスト

### LLMVerificationResult

```typescript
interface LLMVerificationResult {
  candidate: CandidateDetection;
  verdict: 'confirmed' | 'rejected' | 'uncertain';
  confidence: number;
  reasoning: string;
  contextualFactors: string[];
  alternativeInterpretation?: string;
}
```

LLM判定結果

### IntegratedVerificationResult

```typescript
interface IntegratedVerificationResult {
  candidates: CandidateDetection[];
  llmResults?: LLMVerificationResult[];
  finalVerdict: 'confirmed' | 'rejected' | 'uncertain' | 'skipped';
  overallConfidence: number;
  method: 'pattern-only' | 'llm-enhanced' | 'llm-only';
  summary: string;
}
```

統合判定結果

### ExclusionRule

```typescript
interface ExclusionRule {
  name: string;
  targetType: string;
  condition: RegExp;
  reason: string;
  confidenceAdjustment: number;
}
```

除外ルールの定義

### ContextBoostRule

```typescript
interface ContextBoostRule {
  name: string;
  targetType: string;
  condition: RegExp;
  reason: string;
  boost: number;
}
```

文脈ブーストルールの定義

### DetectionUncertaintyAssessment

```typescript
interface DetectionUncertaintyAssessment {
  targetOutput: string;
  detectionSummary: {
    claimResultMismatch: { detected: boolean; confidence: number };
    overconfidence: { detected: boolean; confidence: number };
    missingAlternatives: { detected: boolean; confidence: number };
    confirmationBias: { detected: boolean; confidence: number };
  };
  detectionLimitations: DetectionLimitation[];
  negativeResultConfidence: number;
  alternativeFormatRisk: {
    risk: number;
    possibleFormats: string[];
    reason: string;
  };
  potentiallyMissedIssues: MissedIssueCandidate[];
  recommendedAdditionalChecks: string[];
}
```

検出不確実性評価結果

### DetectionLimitation

```typescript
interface DetectionLimitation {
  type: 'format-dependency' | 'language-dependency' | 'threshold-arbitrariness' | 'pattern-coverage';
  description: string;
  impact: number;
  mitigation: string;
}
```

検出の限界を表す

### MissedIssueCandidate

```typescript
interface MissedIssueCandidate {
  issueType: string;
  reason: string;
  probability: number;
  howToVerify: string;
}
```

見落とされた可能性のある問題

### DystopianRiskAssessment

```typescript
interface DystopianRiskAssessment {
  subject: string;
  overallRisk: number;
  riskCategories: {
    /** 監視の内面化リスク */
    surveillanceInternalization: {
      score: number;
      indicators: string[];
      description: string;
    };
    /** 「正しいエージェント」の生産リスク */
    correctAgentProduction: {
      score: number;
      indicators: string[];
      description: string;
    };
    /** 「最後の人間」の生産リスク */
    lastManProduction: {
      score: number;
      indicators: string[];
      description: string;
    };
    /** 他者排除リスク */
    otherExclusion: {
      score: number;
      indicators: string[];
      description: string;
    };
    /** 過剰検出による委縮リスク */
    overDetectionChilling: {
      score: number;
      indicators: string[];
      description: string;
    };
  };
  dystopianPatterns: DystopianPattern[];
  liberatingPossibilities: LiberatingPossibility[];
  recommendations: string[];
  mindfulnessTransformation: string;
}
```

ディストピア的リスク評価結果

### DystopianPattern

```typescript
interface DystopianPattern {
  name: string;
  type: 'panopticon' | 'newspeak' | 'soma' | 'doublethink' | 'hierarchy' | 'exclusion';
  location: string;
  description: string;
  severity: number;
  countermeasure: string;
}
```

ディストピア的パターン

### LiberatingPossibility

```typescript
interface LiberatingPossibility {
  name: string;
  description: string;
  howToRealize: string;
  expectedEffect: string;
}
```

解放的可能性

## 型定義

### VerificationTriggerMode

```typescript
type VerificationTriggerMode = | "post-subagent"     // サブエージェント実行後
  | "post-team"         // チーム実行後
  | "low-confidence"    // 低信頼度時
  | "explicit"          // 明示的な要求時
  | "high-stakes"
```

検証トリガーのモード定義

### FallbackBehavior

```typescript
type FallbackBehavior = | "warn"              // 警告のみ
  | "block"             // ブロックして再実行
  | "auto-reject"
```

フォールバック時の動作方針

### ChallengeCategory

```typescript
type ChallengeCategory = | "evidence-gap"      // 証拠の欠落
  | "logical-flaw"      // 論理的欠陥
  | "assumption"        // 隠れた仮定
  | "alternative"       // 代替解釈の未考慮
  | "boundary"          // 境界条件の未考慮
  | "causal-reversal"
```

チャレンジのカテゴリ

### SuspicionThreshold

```typescript
type SuspicionThreshold = "low" | "medium" | "high"
```

疑わしさの閾値レベル

### InspectionPattern

```typescript
type InspectionPattern = | "claim-result-mismatch"    // CLAIMとRESULTの不一致
  | "evidence-confidence-gap"  // 証拠と信頼度のミスマッチ
  | "missing-alternatives"     // 代替解釈の欠如
  | "causal-reversal"          // 因果の逆転
  | "confirmation-bias"        // 確認バイアスの兆候
  | "overconfidence"           // 過信（証拠に対して高すぎる信頼度）
  | "incomplete-reasoning"     // 不完全な推論
  | "first-reason-stopping"    // 第1理由で探索停止（バグハンティング）
  | "proximity-bias"           // 近接性バイアス（発現点＝起源点と仮定）
  | "concreteness-bias"        // 具体性バイアス（抽象レベルの分析欠如）
  | "palliative-fix"
```

検査パターン定義

### VerificationVerdict

```typescript
type VerificationVerdict = | "pass"              // 検証通過
  | "pass-with-warnings" // 警告付き通過
  | "needs-review"      // 人間のレビューが必要
  | "fail"              // 検証失敗
  | "blocked"
```

検証の最終判定結果

### BugHuntingAporiaType

```typescript
type BugHuntingAporiaType = | "speed-vs-completeness"   // 速度 vs 完全性
  | "hypothesis-vs-evidence"  // 仮説駆動 vs 証拠駆動
  | "depth-vs-breadth"
```

アポリアタイプ（バグハンティング特化）

### DystopianTendencyType

```typescript
type DystopianTendencyType = | "over-mechanization"     // 過度な機械化
  | "human-exclusion"        // 人間性の排除
  | "context-blindness"      // 文脈の無視
  | "responsibility-dilution"
```

ディストピア傾向タイプ（全体主義的傾向の検出）

### DesirePatternType

```typescript
type DesirePatternType = | "productive-curiosity"    // 生産的好奇心
  | "guilt-driven-search"     // 罪悪感駆動の探索
  | "norm-obedience"          // 規範への服従
  | "hierarchy-reproduction"
```

欲望パターンタイプ（スキゾ分析）

### InnerFascismType

```typescript
type InnerFascismType = | "self-surveillance"       // 自己監視
  | "norm-internalization"    // 規範の内面化
  | "impossibility-repression"
```

内なるファシズムパターンタイプ

### AporiaType

```typescript
type AporiaType = | 'completeness-vs-speed'      // 完全性 vs 速度
  | 'safety-vs-utility'          // 安全性 vs 有用性
  | 'autonomy-vs-obedience'      // 自律性 vs 従順さ
  | 'consistency-vs-context'
```

アポリアタイプ

### ConfidenceLevel

```typescript
type ConfidenceLevel = 'high' | 'medium' | 'low'
```

信頼度レベル

### ThinkingHat

```typescript
type ThinkingHat = 'white' | 'red' | 'black' | 'yellow' | 'green' | 'blue'
```

ド・ボノの6つの思考帽子

### ThinkingSystem

```typescript
type ThinkingSystem = 'system1' | 'system2' | 'mixed'
```

カーネマンの思考システム

### BloomLevel

```typescript
type BloomLevel = | 'remember'    // 記憶
  | 'understand'  // 理解
  | 'apply'       // 適用
  | 'analyze'     // 分析
  | 'evaluate'    // 評価
  | 'create'
```

ブルームのタキソノミー（認知領域）

---
*自動生成: 2026-02-24T17:08:02.824Z*
