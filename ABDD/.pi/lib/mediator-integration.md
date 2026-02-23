---
title: mediator-integration
category: api-reference
audience: developer
last_updated: 2026-02-23
tags: [auto-generated]
related: []
---

# mediator-integration

## 概要

`mediator-integration` モジュールのAPIリファレンス。

## インポート

```typescript
// from './mediator-types.js': MediatorInput, MediatorOutput, MediatorConfig, ...
// from './intent-mediator.js': mediate, mediateWithAnswers, LlmCallFunction
// from './mediator-history.js': loadConfirmedFacts, appendFact, appendSummarySection
```

## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
| 関数 | `runMediatorPhase` | Mediatorフェーズを実行 |
| 関数 | `integrateWithLoopRun` | loop_runにMediatorを統合 |
| 関数 | `createLlmCallFunction` | LLM呼び出し関数を作成 |
| 関数 | `formatMediatorResult` | Mediatorの結果をログ用にフォーマット |
| 関数 | `isMediatorEnabled` | Mediator統合が有効かどうかを判定 |
| インターフェース | `MediatorLoopConfig` | MediatorとLoopの統合設定 |
| インターフェース | `MediatorPhaseResult` | Mediatorフェーズの結果 |
| インターフェース | `QuestionTool` | Question ツールの型定義 |
| インターフェース | `ModelInfo` | モデル情報 |
| インターフェース | `LoopRunParamsWithMediator` | loop_run用のパラメータ拡張 |

## 図解

### クラス図

```mermaid
classDiagram
  class MediatorLoopConfig {
    <<interface>>
    +enableMediator: boolean
    +autoProceedThreshold: number
    +maxClarificationRounds: number
    +historyDir: string
    +debugMode: boolean
  }
  class MediatorPhaseResult {
    <<interface>>
    +success: boolean
    +originalTask: string
    +clarifiedTask: string
    +structuredIntent: StructuredIntent
    +mediatorOutput: MediatorOutput
  }
  class QuestionTool {
    <<interface>>
    +ask: questions_Array_he
  }
  class ModelInfo {
    <<interface>>
    +provider: string
    +id: string
    +thinkingLevel: string
  }
  class LoopRunParamsWithMediator {
    <<interface>>
    +task: string
    +goal: string
    +verifyCommand: string
    +references: Array_id_string_tit
    +model: ModelInfo
  }
```

### 依存関係図

```mermaid
flowchart LR
  subgraph this[mediator-integration]
    main[Main Module]
  end
  subgraph local[ローカルモジュール]
    mediator_types["mediator-types"]
    intent_mediator["intent-mediator"]
    mediator_history["mediator-history"]
  end
  main --> local
```

### 関数フロー

```mermaid
flowchart TD
  buildClarifiedTask["buildClarifiedTask()"]
  createLlmCallFunction["createLlmCallFunction()"]
  formatMediatorResult["formatMediatorResult()"]
  integrateWithLoopRun["integrateWithLoopRun()"]
  isMediatorEnabled["isMediatorEnabled()"]
  runMediatorPhase["runMediatorPhase()"]
  integrateWithLoopRun --> runMediatorPhase
  runMediatorPhase --> buildClarifiedTask
```

### シーケンス図

```mermaid
sequenceDiagram
  autonumber
  participant Caller as 呼び出し元
  participant mediator_integration as "mediator-integration"
  participant mediator_types as "mediator-types"
  participant intent_mediator as "intent-mediator"

  Caller->>mediator_integration: runMediatorPhase()
  activate mediator_integration
  Note over mediator_integration: 非同期処理開始
  mediator_integration->>mediator_types: 内部関数呼び出し
  mediator_types-->>mediator_integration: 結果
  deactivate mediator_integration
  mediator_integration-->>Caller: Promise_MediatorPhas

  Caller->>mediator_integration: integrateWithLoopRun()
  activate mediator_integration
  mediator_integration-->>Caller: Promise_clarifiedTa
  deactivate mediator_integration
```

## 関数

### runMediatorPhase

```typescript
async runMediatorPhase(task: string, config: MediatorLoopConfig, llmCall: LlmCallFunction, questionTool?: QuestionTool): Promise<MediatorPhaseResult>
```

Mediatorフェーズを実行

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| task | `string` | はい |
| config | `MediatorLoopConfig` | はい |
| llmCall | `LlmCallFunction` | はい |
| questionTool | `QuestionTool` | いいえ |

**戻り値**: `Promise<MediatorPhaseResult>`

### buildClarifiedTask

```typescript
buildClarifiedTask(originalTask: string, output: MediatorOutput): string
```

明確化後のタスクを構築

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| originalTask | `string` | はい |
| output | `MediatorOutput` | はい |

**戻り値**: `string`

### integrateWithLoopRun

```typescript
async integrateWithLoopRun(params: LoopRunParamsWithMediator, llmCall: LlmCallFunction, questionTool?: QuestionTool): Promise<{
  clarifiedTask: string;
  mediatorResult?: MediatorPhaseResult;
  shouldProceed: boolean;
}>
```

loop_runにMediatorを統合

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| params | `LoopRunParamsWithMediator` | はい |
| llmCall | `LlmCallFunction` | はい |
| questionTool | `QuestionTool` | いいえ |

**戻り値**: `Promise<{
  clarifiedTask: string;
  mediatorResult?: MediatorPhaseResult;
  shouldProceed: boolean;
}>`

### createLlmCallFunction

```typescript
createLlmCallFunction(callModel: (prompt: string, timeoutMs: number) => Promise<string>): LlmCallFunction
```

LLM呼び出し関数を作成

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| callModel | `(prompt: string, timeoutMs: number) => Promise<...` | はい |

**戻り値**: `LlmCallFunction`

### formatMediatorResult

```typescript
formatMediatorResult(result: MediatorPhaseResult): string
```

Mediatorの結果をログ用にフォーマット

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| result | `MediatorPhaseResult` | はい |

**戻り値**: `string`

### isMediatorEnabled

```typescript
isMediatorEnabled(explicitConfig?: {
  enableMediator?: boolean;
}): boolean
```

Mediator統合が有効かどうかを判定

**パラメータ**

| 名前 | 型 | 必須 |
|------|-----|------|
| explicitConfig | `object` | いいえ |
| &nbsp;&nbsp;↳ enableMediator | `boolean` | いいえ |

**戻り値**: `boolean`

## インターフェース

### MediatorLoopConfig

```typescript
interface MediatorLoopConfig {
  enableMediator: boolean;
  autoProceedThreshold: number;
  maxClarificationRounds: number;
  historyDir: string;
  debugMode: boolean;
}
```

MediatorとLoopの統合設定

### MediatorPhaseResult

```typescript
interface MediatorPhaseResult {
  success: boolean;
  originalTask: string;
  clarifiedTask: string;
  structuredIntent?: StructuredIntent;
  mediatorOutput?: MediatorOutput;
  needsClarification: boolean;
  error?: string;
  processingTimeMs: number;
  clarificationHistory: Array<{
    round: number;
    questions: MediatorQuestion[];
    answers: Array<{ question: string; answer: string }>;
  }>;
}
```

Mediatorフェーズの結果

### QuestionTool

```typescript
interface QuestionTool {
  ask: (questions: Array<{
    header: string;
    question: string;
    options: Array<{ label: string; description: string }>;
    multiple?: boolean;
    custom?: boolean;
  }>) => Promise<Array<{ question: string; answer: string }>>;
}
```

Question ツールの型定義

### ModelInfo

```typescript
interface ModelInfo {
  provider: string;
  id: string;
  thinkingLevel: string;
}
```

モデル情報

### LoopRunParamsWithMediator

```typescript
interface LoopRunParamsWithMediator {
  task: string;
  goal?: string;
  verifyCommand?: string;
  references?: Array<{ id: string; title?: string; source: string }>;
  model: ModelInfo;
  cwd: string;
  enableMediator?: boolean;
  mediatorAutoProceedThreshold?: number;
}
```

loop_run用のパラメータ拡張

---
*自動生成: 2026-02-23T06:29:42.361Z*
