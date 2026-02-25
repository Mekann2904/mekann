---
title: deep-exploration
category: api-reference
audience: developer
last_updated: 2026-02-24
tags: [auto-generated]
related: []
---

# deep-exploration

## 概要

`deep-exploration` モジュールのAPIリファレンス。

## インポート

```typescript
// from './aporia-handler.js': AporiaDetection, AporiaResolution
// from './structured-analysis-output.js': parseAnalysisJson, DEFAULT_ANALYSIS, excellencePursuitToLabel, ...
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `performMetaMetacognition` | 超メタ認知を実行 |
| 関数 | `performNonLinearThinking` | 非線形思考を実行 |
| 関数 | `performParaconsistentReasoning` | 準矛盾的推論を実行 |
| 関数 | `performSelfDestruction` | 自己前提破壊を実行 |
| 関数 | `performSevenPerspectivesAnalysis` | 7つの視座からの分析を実行 |
| 関数 | `performDeepExploration` | 深層探求を実行 |
| 関数 | `deepenExploration` | 深層探求セッションを深化 |
| インターフェース | `MetaMetacognitiveState` | 超メタ認知状態 |
| インターフェース | `NonLinearThought` | 非線形思考結果 |
| インターフェース | `Contradiction` | 矛盾 |
| インターフェース | `ParaconsistentState` | 準矛盾的状態 |
| インターフェース | `SelfDestructionResult` | 自己前提破壊結果 |
| インターフェース | `DeconstructionAnalysis` | 脱構築分析結果 |
| インターフェース | `SchizoAnalysisResult` | スキゾ分析結果 |
| インターフェース | `EudaimoniaEvaluation` | エウダイモニア評価 |
| インターフェース | `UtopiaDystopiaAnalysis` | ユートピア/ディストピア分析 |
| インターフェース | `ThinkingAnalysis` | 思考分析 |
| インターフェース | `TaxonomyResult` | 思考分類学結果 |
| インターフェース | `LogicAnalysis` | 論理分析 |
| インターフェース | `SevenPerspectivesAnalysis` | 7つの視座からの分析結果 |
| インターフェース | `AporiaCoexistence` | アポリアとの共生状態 |
| インターフェース | `DeepExplorationSession` | 深層探求セッション |

## 図解

### クラス図

```mermaid
classDiagram
  class MetaMetacognitiveState {
    <<interface>>
    +layer0: content_string_conf
    +layer1: observation_string
    +layer2: metaObservation_str
    +layer3: any
  }
  class NonLinearThought {
    <<interface>>
    +seed: string
    +associations: Array_content_strin
    +convergencePoints: string
    +evaluation: novelConnections_st
  }
  class Contradiction {
    <<interface>>
    +propositionA: string
    +propositionB: string
    +state: active_acknowledg
    +insights: string
  }
  class ParaconsistentState {
    <<interface>>
    +contradictions: Contradiction
    +explosionGuards: Array_A_A
    +productiveContradictions: Array_contradiction
  }
  class SelfDestructionResult {
    <<interface>>
    +destroyedPremises: Array_premise_strin
    +reconstructedViews: Array_description_s
    +destructionChain: string
  }
  class DeconstructionAnalysis {
    <<interface>>
    +binaryOppositions: string
    +exclusions: string
    +aporias: AporiaDetection
    +diffranceTraces: string
  }
  class SchizoAnalysisResult {
    <<interface>>
    +desireProductions: string
    +innerFascismSigns: string
    +microFascisms: string
    +deterritorializationLines: string
  }
  class EudaimoniaEvaluation {
    <<interface>>
    +excellencePursuit: string
    +pleasureTrapDetected: boolean
    +meaningfulGrowth: string
    +stoicAutonomy: number
  }
  class UtopiaDystopiaAnalysis {
    <<interface>>
    +worldBeingCreated: string
    +totalitarianRisks: string
    +powerDynamics: string
    +lastManTendency: number
  }
  class ThinkingAnalysis {
    <<interface>>
    +isThinking: boolean
    +metacognitionLevel: number
    +autopilotSigns: string
    +chineseRoomRisk: number
  }
  class TaxonomyResult {
    <<interface>>
    +currentMode: string
    +recommendedMode: string
    +modeRationale: string
    +missingModes: string
  }
  class LogicAnalysis {
    <<interface>>
    +fallacies: Array_type_string_l
    +validInferences: string
    +invalidInferences: string
    +classicalLogicLimitations: string
  }
  class SevenPerspectivesAnalysis {
    <<interface>>
    +deconstruction: DeconstructionAnalys
    +schizoAnalysis: SchizoAnalysisResult
    +eudaimonia: EudaimoniaEvaluation
    +utopiaDystopia: UtopiaDystopiaAnalys
    +philosophyOfThought: ThinkingAnalysis
  }
  class AporiaCoexistence {
    <<interface>>
    +acknowledgedAporias: string
    +maintainedTensions: string
    +responsibleDecisions: string
    +avoidanceTemptations: string
  }
  class DeepExplorationSession {
    <<interface>>
    +id: string
    +inquiry: string
    +startedAt: Date
    +lastUpdatedAt: Date
    +perspectives: SevenPerspectivesAna
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[deep-exploration]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    aporia_handler["aporia-handler"]
    structured_analysis_output["structured-analysis-output"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  analyzePowerDynamicsLegacy["analyzePowerDynamicsLegacy()"]
  analyzeWorldBeingCreatedLegacy["analyzeWorldBeingCreatedLegacy()"]
  areContradictory["areContradictory()"]
  destroyPremise["destroyPremise()"]
  detectAutopilotSignsLegacy["detectAutopilotSignsLegacy()"]
  detectBinaryOppositionsLegacy["detectBinaryOppositionsLegacy()"]
  detectDesireProductionsLegacy["detectDesireProductionsLegacy()"]
  detectExclusionsLegacy["detectExclusionsLegacy()"]
  detectInnerFascismSignsLegacy["detectInnerFascismSignsLegacy()"]
  detectPleasureTrapLegacy["detectPleasureTrapLegacy()"]
  detectTotalitarianRisksLegacy["detectTotalitarianRisksLegacy()"]
  evaluateChineseRoomRisk["evaluateChineseRoomRisk()"]
  evaluateExcellencePursuitLegacy["evaluateExcellencePursuitLegacy()"]
  evaluateIsThinkingLegacy["evaluateIsThinkingLegacy()"]
  evaluateLastManTendencyLegacy["evaluateLastManTendencyLegacy()"]
  evaluateMeaningfulGrowthLegacy["evaluateMeaningfulGrowthLegacy()"]
  evaluateMetacognitionLevelLegacy["evaluateMetacognitionLevelLegacy()"]
  evaluateStoicAutonomyLegacy["evaluateStoicAutonomyLegacy()"]
  performMetaMetacognition["performMetaMetacognition()"]
  performNonLinearThinking["performNonLinearThinking()"]
  performParaconsistentReasoning["performParaconsistentReasoning()"]
  performSelfDestruction["performSelfDestruction()"]
  performSevenPerspectivesAnalysis["performSevenPerspectivesAnalysis()"]
  selectDestructionMethod["selectDestructionMethod()"]
  performParaconsistentReasoning --> areContradictory
  performSelfDestruction --> destroyPremise
  performSelfDestruction --> performSelfDestruction
  performSelfDestruction --> selectDestructionMethod
  performSevenPerspectivesAnalysis --> analyzePowerDynamicsLegacy
  performSevenPerspectivesAnalysis --> analyzeWorldBeingCreatedLegacy
  performSevenPerspectivesAnalysis --> detectAutopilotSignsLegacy
  performSevenPerspectivesAnalysis --> detectBinaryOppositionsLegacy
  performSevenPerspectivesAnalysis --> detectDesireProductionsLegacy
  performSevenPerspectivesAnalysis --> detectExclusionsLegacy
  performSevenPerspectivesAnalysis --> detectInnerFascismSignsLegacy
  performSevenPerspectivesAnalysis --> detectPleasureTrapLegacy
  performSevenPerspectivesAnalysis --> detectTotalitarianRisksLegacy
  performSevenPerspectivesAnalysis --> evaluateChineseRoomRisk
  performSevenPerspectivesAnalysis --> evaluateExcellencePursuitLegacy
  performSevenPerspectivesAnalysis --> evaluateIsThinkingLegacy
  performSevenPerspectivesAnalysis --> evaluateLastManTendencyLegacy
  performSevenPerspectivesAnalysis --> evaluateMeaningfulGrowthLegacy
  performSevenPerspectivesAnalysis --> evaluateMetacognitionLevelLegacy
  performSevenPerspectivesAnalysis --> evaluateStoicAutonomyLegacy
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant deep_exploration as "deep-exploration"
  participant aporia_handler as "aporia-handler"
  participant structured_analysis_output as "structured-analysis-output"

  Caller->>deep_exploration: performMetaMetacognition()
  deep_exploration->>aporia_handler: 内部関数呼び出し
  aporia_handler-->>deep_exploration: 結果
  deep_exploration-->>Caller: MetaMetacognitiveSta

  Caller->>deep_exploration: performNonLinearThinking()
  deep_exploration-->>Caller: NonLinearThought
```

## 関数

### generateSessionId

```typescript
generateSessionId(): string
```

セッションIDを生成

**戻り値**: `string`

### performMetaMetacognition

```typescript
performMetaMetacognition(thought: string, metaThought: string): MetaMetacognitiveState
```

超メタ認知を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| thought | `string` | はい |
| metaThought | `string` | はい |

**戻り値**: `MetaMetacognitiveState`

### performNonLinearThinking

```typescript
performNonLinearThinking(seed: string, options: {
    maxAssociations?: number;
    allowRandomJump?: boolean;
  }): NonLinearThought
```

非線形思考を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| seed | `string` | はい |
| options | `object` | はい |
| &nbsp;&nbsp;↳ maxAssociations | `number` | いいえ |
| &nbsp;&nbsp;↳ allowRandomJump | `boolean` | いいえ |

**戻り値**: `NonLinearThought`

### areContradictory

```typescript
areContradictory(a: string, b: string): boolean
```

2つの命題が矛盾的かどうかを判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| a | `string` | はい |
| b | `string` | はい |

**戻り値**: `boolean`

### performParaconsistentReasoning

```typescript
performParaconsistentReasoning(propositions: string[], existingState?: ParaconsistentState): ParaconsistentState
```

準矛盾的推論を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| propositions | `string[]` | はい |
| existingState | `ParaconsistentState` | いいえ |

**戻り値**: `ParaconsistentState`

### selectDestructionMethod

```typescript
selectDestructionMethod(premise: string): string
```

破壊方法を選択

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| premise | `string` | はい |

**戻り値**: `string`

### destroyPremise

```typescript
destroyPremise(premise: string, method: string): { remains: string; newPerspectives: string[] }
```

前提を破壊

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| premise | `string` | はい |
| method | `string` | はい |

**戻り値**: `{ remains: string; newPerspectives: string[] }`

### performSelfDestruction

```typescript
performSelfDestruction(currentPremises: string[], depth: number): SelfDestructionResult
```

自己前提破壊を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| currentPremises | `string[]` | はい |
| depth | `number` | はい |

**戻り値**: `SelfDestructionResult`

### performSevenPerspectivesAnalysis

```typescript
performSevenPerspectivesAnalysis(content: string, context: string): SevenPerspectivesAnalysis
```

7つの視座からの分析を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |
| context | `string` | はい |

**戻り値**: `SevenPerspectivesAnalysis`

### detectBinaryOppositionsLegacy

```typescript
detectBinaryOppositionsLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### detectExclusionsLegacy

```typescript
detectExclusionsLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### detectDesireProductionsLegacy

```typescript
detectDesireProductionsLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### detectInnerFascismSignsLegacy

```typescript
detectInnerFascismSignsLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### evaluateExcellencePursuitLegacy

```typescript
evaluateExcellencePursuitLegacy(content: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string`

### detectPleasureTrapLegacy

```typescript
detectPleasureTrapLegacy(content: string): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `boolean`

### evaluateMeaningfulGrowthLegacy

```typescript
evaluateMeaningfulGrowthLegacy(content: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string`

### evaluateStoicAutonomyLegacy

```typescript
evaluateStoicAutonomyLegacy(content: string): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `number`

### analyzeWorldBeingCreatedLegacy

```typescript
analyzeWorldBeingCreatedLegacy(content: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string`

### detectTotalitarianRisksLegacy

```typescript
detectTotalitarianRisksLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### analyzePowerDynamicsLegacy

```typescript
analyzePowerDynamicsLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### evaluateLastManTendencyLegacy

```typescript
evaluateLastManTendencyLegacy(content: string): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `number`

### evaluateIsThinkingLegacy

```typescript
evaluateIsThinkingLegacy(content: string): boolean
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `boolean`

### evaluateMetacognitionLevelLegacy

```typescript
evaluateMetacognitionLevelLegacy(content: string): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `number`

### detectAutopilotSignsLegacy

```typescript
detectAutopilotSignsLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### evaluateChineseRoomRisk

```typescript
evaluateChineseRoomRisk(content: string): number
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `number`

### detectCurrentThinkingModeLegacy

```typescript
detectCurrentThinkingModeLegacy(content: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string`

### recommendThinkingModeLegacy

```typescript
recommendThinkingModeLegacy(context: string): string
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| context | `string` | はい |

**戻り値**: `string`

### detectMissingThinkingModesLegacy

```typescript
detectMissingThinkingModesLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### detectFallaciesLegacy

```typescript
detectFallaciesLegacy(content: string): Array<{ type: string; location: string; description: string; correction: string }>
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `Array<{ type: string; location: string; description: string; correction: string }>`

### detectValidInferencesLegacy

```typescript
detectValidInferencesLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### detectInvalidInferencesLegacy

```typescript
detectInvalidInferencesLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### detectClassicalLogicLimitationsLegacy

```typescript
detectClassicalLogicLimitationsLegacy(content: string): string[]
```

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| content | `string` | はい |

**戻り値**: `string[]`

### performDeepExploration

```typescript
performDeepExploration(inquiry: string, options: {
    initialPremises?: string[];
    depth?: number;
    enableNonLinearThinking?: boolean;
    enableSelfDestruction?: boolean;
  }): DeepExplorationSession
```

深層探求を実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| inquiry | `string` | はい |
| options | `object` | はい |
| &nbsp;&nbsp;↳ initialPremises | `string[]` | いいえ |
| &nbsp;&nbsp;↳ depth | `number` | いいえ |
| &nbsp;&nbsp;↳ enableNonLinearThinking | `boolean` | いいえ |
| &nbsp;&nbsp;↳ enableSelfDestruction | `boolean` | いいえ |

**戻り値**: `DeepExplorationSession`

### deepenExploration

```typescript
deepenExploration(session: DeepExplorationSession, newInsight: string): DeepExplorationSession
```

深層探求セッションを深化

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| session | `DeepExplorationSession` | はい |
| newInsight | `string` | はい |

**戻り値**: `DeepExplorationSession`

## インターフェース

### MetaMetacognitiveState

```typescript
interface MetaMetacognitiveState {
  layer0: {
    content: string;
    confidence: number;
  };
  layer1: {
    observation: string;
    evaluation: string;
  };
  layer2: {
    metaObservation: string;
    /** 「自分はメタ認知していると思っているが、それは形式的ではないか？」 */
    formalizationRisk: number;
    /** 「このメタ認科学は何を排除しているか？」 */
    exclusions: string[];
  };
  layer3: {
    /** 「この分析自体もまた形式的パターンに陥っていないか？」 */
    infiniteRegressAwareness: boolean;
    /** 分析の停止点（どこで「十分」とするか） */
    stoppingPoint: string;
    /** 停止点選択の恣意性の認識 */
    arbitrarinessAcknowledged: boolean;
  };
}
```

超メタ認知状態

### NonLinearThought

```typescript
interface NonLinearThought {
  seed: string;
  associations: Array<{
    content: string;
    /** なぜこの連想が生まれたか（事後的な合理化） */
    rationale?: string;
    /** 連想の強度（0-1） */
    strength: number;
    /** 連想タイプ */
    type: 'semantic' | 'phonetic' | 'visual' | 'emotional' | 'random';
  }>;
  convergencePoints: string[];
  evaluation: {
    novelConnections: string[];
    potentialInsights: string[];
    discardedAsRandom: string[];
  };
}
```

非線形思考結果

### Contradiction

```typescript
interface Contradiction {
  propositionA: string;
  propositionB: string;
  state: 'active' | 'acknowledged' | 'productive';
  insights: string[];
}
```

矛盾

### ParaconsistentState

```typescript
interface ParaconsistentState {
  contradictions: Contradiction[];
  explosionGuards: Array<{
    /** 「Aかつ非A」から「任意のB」を導出しないための防衛 */
    guardCondition: string;
    protectedPropositions: string[];
  }>;
  productiveContradictions: Array<{
    contradiction: Contradiction;
    /** 矛盾から引き出された有用な結論 */
    derivedInsights: string[];
  }>;
}
```

準矛盾的状態

### SelfDestructionResult

```typescript
interface SelfDestructionResult {
  destroyedPremises: Array<{
    premise: string;
    destructionMethod: string;
    whatRemains: string;
  }>;
  reconstructedViews: Array<{
    description: string;
    basedOn: string[];
    /** どれくらい脆いか */
    instability: number;
  }>;
  destructionChain: string[];
}
```

自己前提破壊結果

### DeconstructionAnalysis

```typescript
interface DeconstructionAnalysis {
  binaryOppositions: string[];
  exclusions: string[];
  aporias: AporiaDetection[];
  diffranceTraces: string[];
}
```

脱構築分析結果

### SchizoAnalysisResult

```typescript
interface SchizoAnalysisResult {
  desireProductions: string[];
  innerFascismSigns: string[];
  microFascisms: string[];
  deterritorializationLines: string[];
}
```

スキゾ分析結果

### EudaimoniaEvaluation

```typescript
interface EudaimoniaEvaluation {
  excellencePursuit: string;
  pleasureTrapDetected: boolean;
  meaningfulGrowth: string;
  stoicAutonomy: number;
}
```

エウダイモニア評価

### UtopiaDystopiaAnalysis

```typescript
interface UtopiaDystopiaAnalysis {
  worldBeingCreated: string;
  totalitarianRisks: string[];
  powerDynamics: string[];
  lastManTendency: number;
}
```

ユートピア/ディストピア分析

### ThinkingAnalysis

```typescript
interface ThinkingAnalysis {
  isThinking: boolean;
  metacognitionLevel: number;
  autopilotSigns: string[];
  chineseRoomRisk: number;
}
```

思考分析

### TaxonomyResult

```typescript
interface TaxonomyResult {
  currentMode: string;
  recommendedMode: string;
  modeRationale: string;
  missingModes: string[];
}
```

思考分類学結果

### LogicAnalysis

```typescript
interface LogicAnalysis {
  fallacies: Array<{
    type: string;
    location: string;
    description: string;
    correction: string;
  }>;
  validInferences: string[];
  invalidInferences: string[];
  classicalLogicLimitations: string[];
}
```

論理分析

### SevenPerspectivesAnalysis

```typescript
interface SevenPerspectivesAnalysis {
  deconstruction: DeconstructionAnalysis;
  schizoAnalysis: SchizoAnalysisResult;
  eudaimonia: EudaimoniaEvaluation;
  utopiaDystopia: UtopiaDystopiaAnalysis;
  philosophyOfThought: ThinkingAnalysis;
  taxonomyOfThought: TaxonomyResult;
  logic: LogicAnalysis;
}
```

7つの視座からの分析結果

### AporiaCoexistence

```typescript
interface AporiaCoexistence {
  acknowledgedAporias: string[];
  maintainedTensions: string[];
  responsibleDecisions: string[];
  avoidanceTemptations: string[];
}
```

アポリアとの共生状態

### DeepExplorationSession

```typescript
interface DeepExplorationSession {
  id: string;
  inquiry: string;
  startedAt: Date;
  lastUpdatedAt: Date;
  perspectives: SevenPerspectivesAnalysis;
  aporias: AporiaDetection[];
  aporiaResolutions: AporiaResolution[];
  aporiaCoexistence: AporiaCoexistence;
  selfDestruction: SelfDestructionResult;
  metaMetacognition: MetaMetacognitiveState;
  nonLinearThoughts: NonLinearThought[];
  paraconsistentState: ParaconsistentState;
  status: 'exploring' | 'deepening' | 'resting' | 'returning' | 'stagnant';
  nextDirections: string[];
  depth: number;
  warnings: string[];
}
```

深層探求セッション

---
*自動生成: 2026-02-24T17:08:02.654Z*
