---
title: Subagents と Agent Teams のシーケンス図
category: development
audience: developer
last_updated: 2026-02-17
tags: [subagents, agent-teams, sequence-diagram, architecture]
related: [../02-user-guide/08-subagents.md, ../02-user-guide/09-agent-teams.md]
---

# Subagents と Agent Teams のシーケンス図

このドキュメントは、pi coding agentのsubagentsとagent teamsを組み合わせた場合の実行フローを詳細に示すMermaidシーケンス図集です。

## 目次

1. [全体フロー（subagents + agent teams）](#1-全体フローsubagents--agent-teams)
2. [コミュニケーションラウンド詳細](#2-コミュニケーションラウンド詳細)
3. [キャパシティ管理とコンテキスト追加タイミング](#3-キャパシティ管理とコンテキスト追加タイミング)
4. [スキル読み込みと継承](#4-スキル読み込みと継承)
5. [エラーハンドリング詳細](#5-エラーハンドリング詳細)
6. [並列実行制約](#6-並列実行制約)

---

## 1. 全体フロー（subagents + agent teams）

ユーザーリクエストから最終出力までの完全なシーケンス図。

### シーケンス図

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant LA as Lead Agent
    participant Sys as System
    participant Skill as Skill System
    participant DC as Delegation Checker
    participant RM as Runtime Manager
    participant SA as Subagent A
    participant SB as Subagent B
    participant TA as Team A
    participant TB as Team B
    participant M1 as Member 1
    participant M2 as Member 2
    participant M3 as Member 3
    participant CS as Communication System
    participant FJ as Final Judge

    Note over User,FJ: 開始フェーズ
    User->>LA: リクエスト送信
    LA->>Sys: before_agent_startイベント
    Sys->>LA: Proactive Delegation Prompt注入
    LA->>Skill: スキルキーワード検出
    Skill->>LA: SKILL.md読み込み

    Note over LA,DC: Delegation-First Policyチェック
    LA->>DC: 直接編集試行
    DC->>LA: ブロック（委譲未実行）
    LA->>DC: 委譲ツール呼び出し
    DC->>DC: markDelegationUsed()

    Note over LA,RM: 並列実行開始
    LA->>RM: waitForRuntimeOrchestrationTurn()
    RM->>RM: キャパシティチェック
    RM->>LA: キャパシティ予約完了

    Note over LA,SB: subagent_run_parallel実行
    par 並列実行
        LA->>SA: runSubagentTask(extraContext)
        SA->>SA: buildSubagentPrompt()
        SA->>SA: resolveEffectiveSkills()
        SA->>SA: runPiPrintMode()
        SA->>LA: SUMMARY/RESULT/NEXT_STEP
    and
        LA->>SB: runSubagentTask(extraContext)
        SB->>SB: buildSubagentPrompt()
        SB->>SB: resolveEffectiveSkills()
        SB->>SB: runPiPrintMode()
        SB->>LA: SUMMARY/RESULT/NEXT_STEP
    end

    Note over LA,TB: agent_team_run_parallel実行
    par チーム並列実行
        LA->>TA: runTeamTask(sharedContext)
        TA->>M1: buildTeamMemberPrompt()
        TA->>M2: buildTeamMemberPrompt()
        TA->>M3: buildTeamMemberPrompt()
        par チームメンバー並列
            M1->>M1: 初期実行 (phase: initial)
            M1->>TA: SUMMARY/CLAIM/EVIDENCE/CONFIDENCE/DISCUSSION/RESULT
        and
            M2->>M2: 初期実行
            M2->>TA: SUMMARY/CLAIM/EVIDENCE/CONFIDENCE/DISCUSSION/RESULT
        and
            M3->>M3: 初期実行
            M3->>TA: SUMMARY/CLAIM/EVIDENCE/CONFIDENCE/DISCUSSION/RESULT
        end
        Note over TA,CS: コミュニケーションラウンド
        TA->>CS: buildCommunicationContext()
        CS->>M1: 連携相手の要約
        CS->>M2: 連携相手の要約
        M1->>CS: detectPartnerReferences()
        M1->>TA: 更新されたDISCUSSION
        M2->>TA: 更新されたDISCUSSION
        Note over TA,FJ: 最終判定
        TA->>FJ: computeProxyUncertainty()
        FJ->>TA: verdict (accept/reject/needs-review)
        TA->>LA: チーム結果
    and
        LA->>TB: runTeamTask(sharedContext)
        TB->>LA: チーム結果
    end

    Note over LA,User: 結果統合フェーズ
    LA->>LA: 全結果のレビュー
    LA->>LA: 合意/不合意の特定
    LA->>User: 最終応答 (DISCUSSIONセクション付き)
```

### 各ステップの説明

| ステップ | フェーズ | 説明 | ソースコード |
|---------|---------|------|-------------|
| 1-5 | 開始 | User -> Lead Agent -> System -> Skill System | `.pi/APPEND_SYSTEM.md` |
| 6-9 | Delegation-First | 直接編集ブロック、委譲強制 | `.pi/extensions/subagents.ts:75-82` |
| 10-13 | キャパシティ | waitForRuntimeOrchestrationTurn、tryReserveRuntimeCapacity | `.pi/extensions/agent-runtime.ts:330-430` |
| 14-21 | Subagent並列 | runSubagentTask with extraContext | `.pi/extensions/subagents.ts:1820-2050` |
| 22-46 | Team並列 | runTeamTask with sharedContext、コミュニケーションラウンド | `.pi/extensions/agent-teams.ts:2816-3900` |
| 47-49 | 最終判定 | computeProxyUncertainty、runFinalJudge | `.pi/extensions/agent-teams/judge.ts` |
| 50-52 | 統合 | 全結果レビュー、合意形成 | `.pi/APPEND_SYSTEM.md:115-150` |

---

## 2. コミュニケーションラウンド詳細

エージェントチーム内でのコミュニケーションラウンドの詳細フロー。

### シーケンス図

```mermaid
sequenceDiagram
    autonumber
    participant TA as Team A
    participant CS as Communication System
    participant M1 as Member 1
    participant M2 as Member 2
    participant M3 as Member 3

    Note over TA,M3: 連携関係構築
    TA->>CS: createCommunicationLinksMap()
    CS->>CS: 連携関係マップ構築
    Note right of CS: MAX_COMMUNICATION_PARTNERS=3<br/>隣接メンバー + アンカーメンバー
    CS-->>TA: linksMap返却

    Note over TA,M3: コミュニケーションコンテキスト生成
    TA->>CS: buildCommunicationContext()
    CS->>CS: 全メンバー出力収集
    CS->>CS: 要約テキスト生成
    CS->>M1: 連携相手のCLAIM参照 (M2, M3の要約)
    CS->>M2: 連携相手のCLAIM参照 (M1, M3の要約)
    CS->>M3: 連携相手のCLAIM参照 (M1, M2の要約)

    Note over M1,M3: 合意形成プロセス
    M1->>M1: detectPartnerReferences()
    M1->>M1: SUMMARY/CLAIM/EVIDENCE分析
    M1->>CS: 合意/不合意の判定
    M2->>M2: detectPartnerReferences()
    M2->>M2: SUMMARY/CLAIM/EVIDENCE分析
    M2->>CS: 合意/不合意の判定
    M3->>M3: detectPartnerReferences()
    M3->>M3: SUMMARY/CLAIM/EVIDENCE分析
    M3->>CS: 合意/不合意の判定

    Note over CS,M3: 合意形成結果
    CS->>M1: コミュニケーションコンテキスト更新
    CS->>M2: コミュニケーションコンテキスト更新
    CS->>M3: コミュニケーションコンテキスト更新

    M1->>TA: 更新されたDISCUSSION (合意: ...明記)
    M2->>TA: 更新されたDISCUSSION (合意: ...明記)
    M3->>TA: 更新されたDISCUSSION (合意: ...明記)

    TA->>TA: 全DISCUSSION統合
    TA-->>TA: チーム合意形成完了
```

### 通信リンク構築ルール

```
createCommunicationLinksMap(members):
  1. 隣接メンバーとリンク（循環）
     - member[i] -> member[i-1]
     - member[i] -> member[i+1]

  2. アンカーメンバーとリンク（双方向）
     - consensus, synthesizer, reviewer, lead, judge

  3. 最大パートナー数: 3 (MAX_COMMUNICATION_PARTNERS)
```

### DISCUSSION出力形式

```
DISCUSSION:
[メンバー名]の主張に言及:
- 同意点: [具体的な内容]
- 懸念点: [具体的な内容と根拠]
合意: [合意内容の要約]
```

### ソースコード参照

| 関数 | 場所 |
|------|------|
| `createCommunicationLinksMap()` | `.pi/extensions/agent-teams/communication.ts:90-130` |
| `buildCommunicationContext()` | `.pi/extensions/agent-teams/communication.ts:160-210` |
| `detectPartnerReferences()` | `.pi/extensions/agent-teams/communication.ts:220-250` |
| `sanitizeCommunicationSnippet()` | `.pi/extensions/agent-teams/communication.ts:140-160` |

---

## 3. キャパシティ管理とコンテキスト追加タイミング

ランタイムキャパシティの管理と、各種コンテキストが追加されるタイミング。

### シーケンス図

```mermaid
sequenceDiagram
    autonumber
    participant LA as Lead Agent
    participant RM as Runtime Manager
    participant SA as Subagent
    participant TA as Team
    participant CM as Communication Module

    Note over LA,RM: キャパシティ管理開始
    LA->>RM: waitForRuntimeOrchestrationTurn()

    alt キャパシティ空きあり
        RM->>RM: tryReserveRuntimeCapacity()
        RM->>RM: runtimeCount < maxParallelSubagentsPerRun
        RM-->>LA: 成功: キャパシティ予約完了
    else キャパシティ不足
        RM->>RM: tryReserveRuntimeCapacity()
        RM->>RM: runtimeCount >= maxParallelSubagentsPerRun
        RM->>RM: キューイング待機
        RM->>RM: adaptive penalty計算
        RM-->>LA: 待機後、キャパシティ予約完了
    end

    Note over LA,SA: extraContext追加タイミング (subagent_run)
    LA->>LA: extraContext構築
    LA->>LA: {delegationContext, parentSkills, ...}
    LA->>SA: runSubagentTask(extraContext)
    SA->>SA: extraContext受信
    SA->>SA: プロンプトに反映

    Note over LA,TA: sharedContext追加タイミング (team実行)
    LA->>LA: sharedContext構築
    LA->>LA: {teamMission, teamGoal, ...}
    LA->>TA: runTeamTask(sharedContext)
    TA->>TA: sharedContext受信
    TA->>TA: 全メンバーに共有

    Note over TA,CM: communicationContext追加タイミング (ラウンド実行)
    TA->>CM: buildCommunicationContext()
    CM->>CM: メンバー出力収集
    CM->>CM: 連携関係構築
    CM-->>TA: communicationContext返却
    TA->>TA: メンバーにcommunicationContext配布

    Note over RM,LA: 並列度調整
    RM->>RM: adaptive penalty適用
    RM->>RM: 並列度 = max(1, floor(capacity / penalty))
    RM-->>LA: 調整後キャパシティ通知
```

### コンテキスト追加タイミングと内容

| コンテキスト種別 | 追加タイミング | パラメータ | 内容 | ソースコード |
|----------------|--------------|----------|------|-------------|
| **extraContext** | `subagent_run` / `subagent_run_parallel` 呼び出し時 | `extraContext: string` | タスク固有の補足情報 | `subagents.ts:1592-1820` |
| **sharedContext** | `agent_team_run` / `agent_team_run_parallel` 呼び出し時 | `sharedContext: string` | チーム全体で共有する指示 | `agent-teams.ts:2816-3300` |
| **communicationContext** | コミュニケーションラウンド実行時 | 自動生成 | 連携相手の要約・CLAIM/EVIDENCE/CONFIDENCE | `communication.ts:160-210` |
| **parentSkills** | サブエージェント/チームメンバー委譲時 | `parentSkills: string[]` | 親エージェントから継承するスキル | `subagents.ts:1044-1054` |

### キャパシティ制約

| 制約 | デフォルト値 | stable profile | 説明 |
|------|------------|---------------|------|
| `maxParallelSubagentsPerRun` | 4 | 2 | 1回の実行で同時実行可能なsubagent数 |
| `maxParallelTeamsPerRun` | 3 | 1 | 1回の実行で同時実行可能なチーム数 |
| `maxParallelTeammatesPerTeam` | 6 | 3 | 1チーム内で同時実行可能なメンバー数 |
| `maxTotalActiveLlm` | 8 | 4 | システム全体でのアクティブLLM数 |
| `maxTotalActiveRequests` | 6 | 2 | システム全体でのアクティブリクエスト数 |
| `maxConcurrentOrchestrations` | 2 | 2 | 同時オーケストレーション数 |
| `capacityWaitMs` | 30000 | 12000 | キャパシティ待機タイムアウト |
| `reservationTtlMs` | 60000 | 45000 | 予約TTL |

### Feature Flags (v2.0.0+)

| 環境変数 | 値 | デフォルト | 説明 |
|---------|---|-----------|------|
| `PI_OUTPUT_SCHEMA_MODE` | legacy/dual/strict | **strict** | 出力検証モード |
| `PI_ADAPTIVE_PENALTY_MODE` | legacy/enhanced | **enhanced** | ペナルティ制御モード |
| `PI_JUDGE_WEIGHTS_PATH` | ファイルパス | (なし) | Judge重み設定ファイル |

### Adaptive Penalty

```
adaptivePenalty.raise(reason):
  # Legacy mode: linear decay
  - penalty = min(maxPenalty, penalty + 1)

  # Enhanced mode (default since v2.0.0): exponential decay + reason weights
  - decayMultiplier = 0.5 (exponential)
  - reasonWeights = { rate_limit: 2.0, capacity: 1.5, timeout: 1.0, schema_violation: 0.5 }
  - effectiveStep = reasonWeights[reason] || 1.0
  - penalty = min(maxPenalty, penalty + effectiveStep)

adaptivePenalty.lower():
  # Legacy mode
  - penalty = max(0, penalty - 1)

  # Enhanced mode
  - penalty = penalty * decayMultiplier

adaptivePenalty.applyLimit(baseLimit):
  - IF penalty <= 0: RETURN baseLimit
  - RETURN max(1, floor(baseLimit / (penalty + 1)))
```

**Feature Flag**: `PI_ADAPTIVE_PENALTY_MODE` (default: `enhanced`)

---

## 4. スキル読み込みと継承

スキルの読み込み、継承、プロンプトへの注入フロー。

### シーケンス図

```mermaid
sequenceDiagram
    autonumber
    participant PA as Parent Agent
    participant SA as Subagent/Team Member
    participant TD as Team Definition
    participant SK as Skill System
    participant FS as File System

    Note over PA,SA: スキル継承開始
    PA->>PA: parentSkills確認

    alt 親からスキル継承あり
        PA->>SA: parentSkills渡し
        SA->>SA: 継承スキル受信
    else 継承なし
        SA->>SA: parentSkills = []
    end

    Note over SA,TD: チーム定義スキル確認
    SA->>TD: チーム定義確認
    TD-->>SA: teamSkills返却

    Note over SA,SK: スキル配列マージ
    SA->>SK: mergeSkillArrays(parentSkills, teamSkills)
    SK->>SK: 重複排除
    SK->>SK: 優先度ソート
    SK-->>SA: mergedSkills返却

    Note over SA,FS: スキルコンテンツ読み込み
    loop 各スキルに対して
        SA->>SK: loadSkillContent(skillName)
        SK->>FS: SKILL.md読み込み
        Note right of FS: スキルパス検索順序:<br/>1. .pi/lib/skills/<name>/SKILL.md<br/>2. .pi/skills/<name>/SKILL.md
        FS-->>SK: ファイル内容
        SK->>SK: 内容解析（frontmatter後の本文抽出）
        SK-->>SA: skillContent返却
    end

    Note over SK,SA: プロンプト注入
    SK->>SK: formatSkillsSection(mergedSkills)
    SK->>SK: スキルセクション生成
    SK-->>SA: formattedSkillsSection返却
    SA->>SA: プロンプトにスキルセクション挿入

    Note over SA,SA: スキル適用完了
    SA->>SA: スキル指示に従い実行
```

### スキル継承の優先順位

```
resolveEffectiveSkills(agent, parentSkills):
  1. parentSkills（親エージェントから継承）
  2. agent.skills（エージェント定義のスキル）
  3. mergeSkillArrays()で重複排除してマージ
```

### スキルセクション形式

```xml
<available_skills>
  <skill>
    <name>skill-name</name>
    <description>スキルの説明</description>
    <location>/path/to/skill/SKILL.md</location>
  </skill>
</available_skills>
```

### スキル読み込みトリガー

検出パターン（MANDATORY load trigger）:
- キーワード: "git", "commit", "branch", "push", "pull", "merge", "rebase", "stash"
- 日本語: "コミット", "ブランチ", "プッシュ", "マージ", "リベース", "コンフリクト"

### ソースコード参照

| 関数 | 場所 |
|------|------|
| `mergeSkillArrays()` | `subagents.ts:1023-1040`, `agent-teams.ts:1922-1945` |
| `resolveEffectiveSkills()` | `subagents.ts:1044-1054` |
| `loadSkillContent()` | `agent-teams.ts:1973-2015` |
| `formatSkillsSection()` | `subagents.ts:1054-1090` |

---

## 5. エラーハンドリング詳細

キャパシティ不足、タイムアウト、キャンセル等のエラーハンドリングフロー。

### シーケンス図

```mermaid
sequenceDiagram
    autonumber
    participant LA as Lead Agent
    participant RM as Runtime Manager
    participant SA as Subagent
    participant EH as Error Handler

    Note over LA,EH: エラーハンドリング詳細検証

    LA->>RM: waitForRuntimeOrchestrationTurn()

    alt キャパシティ不足エラー
        RM->>RM: tryReserveRuntimeCapacity()
        RM->>RM: runtimeCount >= maxParallelSubagentsPerRun
        RM->>RM: adaptivePenalty.raise("capacity")
        RM->>EH: Error: runtime_limit_reached
        EH-->>LA: outcomeCode: RETRYABLE_FAILURE
        EH-->>LA: retryRecommended: true
    else キュータイムアウト
        RM->>RM: waitedMs >= capacityWaitMs
        RM->>EH: Error: runtime_queue_timeout
        EH-->>LA: outcomeCode: TIMEOUT
        EH-->>LA: retryRecommended: true
    else キャンセル
        RM->>RM: signal.aborted = true
        RM->>EH: Error: runtime_queue_aborted
        EH-->>LA: outcomeCode: CANCELLED
        EH-->>LA: retryRecommended: false
    else 成功
        RM->>RM: キャパシティ予約成功
        RM-->>LA: lease返却
        LA->>SA: runSubagentTask()
        SA-->>LA: 実行結果
    end

    Note over RM,LA: 並列実行制約
    RM->>RM: maxParallelSubagentsPerRun確認
    RM->>RM: maxParallelTeamsPerRun確認
    RM->>RM: maxParallelTeammatesPerTeam確認
    RM->>RM: maxTotalActiveLlm確認
    RM-->>LA: 制約内で実行許可
```

### エラーコードと対応

| エラー | outcomeCode | retryRecommended | 説明 |
|--------|-------------|-----------------|------|
| `runtime_limit_reached` | RETRYABLE_FAILURE | true | キャパシティ不足 |
| `runtime_queue_timeout` | TIMEOUT | true | キュータイムアウト |
| `runtime_queue_aborted` | CANCELLED | false | ユーザーキャンセル |

### 拡張エラー分類 (v2.0.0+)

| ExtendedOutcomeCode | 説明 | retryRecommended | 判定条件 |
|---------------------|------|-----------------|----------|
| `SCHEMA_VIOLATION` | 出力形式がスキーマに違反 | true | 必須フィールド欠落、CONFIDENCE範囲外 |
| `LOW_SUBSTANCE` | 意図のみで実質的成果物がない | true | RESULTが空または意図のみ |
| `EMPTY_OUTPUT` | 出力が空 | true | テキストなし |
| `PARSE_ERROR` | JSON/構造化パース失敗 | true | 構文エラー |

```typescript
// セマンティックエラー分類
classifySemanticError(output, error): { code, details? }
  - SCHEMA_VIOLATION: スキーマ検証失敗
  - LOW_SUBSTANCE: 実質的成果物なし
  - EMPTY_OUTPUT: 空出力
  - PARSE_ERROR: パース失敗
```

### Final Judge判定

| 条件 | 信号 | 説明 |
|------|------|------|
| `uSys >= 0.6` | high_system_uncertainty | システム全体の不確実性が高い |
| `failedRatio >= 0.3` | teammate_failures | チームメンバーの失敗率が高い |

### Judge重み設定 (v2.0.0+)

```typescript
// デフォルト重み設定 (DEFAULT_JUDGE_WEIGHTS)
{
  intraWeights: {
    failedRatio: 0.38,      // 失敗率の重み
    lowConfidence: 0.26,    // 低信頼度の重み
    noEvidence: 0.20,       // 証拠なしの重み
    contradiction: 0.16     // 矛盾の重み
  },
  interWeights: {
    conflictRatio: 0.42,    // コンフリクト率
    confidenceSpread: 0.28, // 信頼度ばらつき
    failedRatio: 0.20,
    noEvidence: 0.10
  },
  sysWeights: {
    uIntra: 0.45,           // メンバー内不確実性
    uInter: 0.35,           // メンバー間不確実性
    failedRatio: 0.20
  }
}
```

**カスタム重み設定**: `PI_JUDGE_WEIGHTS_PATH` 環境変数でJSONファイルを指定可能

### Judge説明可能性 (v2.0.0+)

```typescript
computeProxyUncertaintyWithExplainability():
  - explanation.intraFactors: [内要因の詳細リスト]
  - explanation.interFactors: [間要因の詳細リスト]
  - explanation.sysFactors: [システム要因の詳細リスト]
  - explanation.breakdown: { uIntra, uInter, uSys の内訳 }

formatJudgeExplanation(explanation):
  // 人間可読な説明を生成
  "uIntra計算: failedRatio(0.38)*0.12 + lowConfidence(0.26)*0.08 + ..."
```

### スキーマ検証 (v2.0.0+)

```typescript
// 出力スキーマ検証モード
PI_OUTPUT_SCHEMA_MODE:
  - "legacy": 正規表現ベース検証（非推奨）
  - "dual": 正規表現 + スキーマ検証（差分ログ出力）
  - "strict": スキーマ検証のみ（デフォルト）

// スキーマ定義
SCHEMAS.subagent:
  - SUMMARY: required, min 10 chars
  - RESULT: required, min 20 chars
  - CONFIDENCE: optional, 0.00-1.00
  - CLAIM: optional
  - EVIDENCE: optional
  - DISCUSSION: optional
  - NEXT_STEP: optional

SCHEMAS.teamMember:
  - SUMMARY: required, min 10 chars
  - CLAIM: required
  - EVIDENCE: required
  - CONFIDENCE: required, 0.00-1.00
  - DISCUSSION: required
  - RESULT: required, min 20 chars
```

---

## 6. 並列実行制約

並列実行時の制約とバッチ処理のフロー。

### シーケンス図

```mermaid
sequenceDiagram
    autonumber
    participant LA as Lead Agent
    participant RM as Runtime Manager
    participant SA1 as Subagent 1
    participant SA2 as Subagent 2
    participant SA3 as Subagent 3
    participant SA4 as Subagent 4

    Note over LA,SA4: 並列実行制約検証

    LA->>RM: subagent_run_parallel(subagentIds: [1,2,3,4])
    RM->>RM: getRuntimeSnapshot()
    RM->>RM: maxParallelSubagentsPerRun = 3
    RM->>RM: requestedCount = 4
    RM->>RM: allowedCount = min(4, 3) = 3

    alt 制約内実行
        RM->>RM: tryReserveRuntimeCapacity(3)
        RM-->>LA: キャパシティ予約 (3スロット)
        par 並列実行 (最大3)
            LA->>SA1: runSubagentTask()
            SA1-->>LA: 結果1
        and
            LA->>SA2: runSubagentTask()
            SA2-->>LA: 結果2
        and
            LA->>SA3: runSubagentTask()
            SA3-->>LA: 結果3
        end
        Note over LA,SA4: 残り1つは順次実行または次バッチ
        LA->>RM: 追加キャパシティ要求
        RM->>RM: tryReserveRuntimeCapacity(1)
        RM-->>LA: キャパシティ予約 (1スロット)
        LA->>SA4: runSubagentTask()
        SA4-->>LA: 結果4
    end

    LA->>LA: 全結果統合
    LA-->>LA: 並列実行完了
```

### 並列実行制約の詳細

```
resolveSubagentParallelCapacity():
  1. baselineParallelism = min(
       configuredParallelLimit,
       activeAgents.length,
       maxTotalActiveLlm
     )
  2. effectiveParallelism = adaptivePenalty.applyLimit(baselineParallelism)
  3. バッチ処理で制約を超えるリクエストを処理
```

### チーム並列実行の制約

```
resolveTeamParallelCapacity():
  1. baselineTeamParallelism = min(
       configuredTeamParallelLimit,
       enabledTeams.length,
       maxTotalActiveRequests
     )
  2. effectiveTeamParallelism = adaptivePenalty.applyLimit(baselineTeamParallelism)
  3. desiredLlmBudgetPerTeam = maxTotalActiveLlm / effectiveTeamParallelism
  4. baselineMemberParallelism = min(
       configuredMemberParallelLimit,
       maxEnabledMembersPerTeam,
       desiredLlmBudgetPerTeam
     )
```

---

## 出力形式

### サブエージェント出力形式

```
SUMMARY: <短い要約>
CLAIM: <1文の中核主張>
EVIDENCE: <カンマ区切りの証拠, file:line参照可能>
CONFIDENCE: <0.00-1.00>
DISCUSSION: <他エージェント参照, 合意/不合意, コンセンサス>
RESULT:
<主な回答>
NEXT_STEP: <具体的次アクション または none>
```

### チームメンバー出力形式

```
SUMMARY: <日本語の短い要約>
CLAIM: <日本語で1文の中核主張>
EVIDENCE: <根拠をカンマ区切り。可能なら file:line>
CONFIDENCE: <0.00-1.00>
DISCUSSION: <他メンバーのoutputを参照し、同意点/不同意点を記述>
            <合意形成時は「合意: [要約]」を明記>
RESULT:
<日本語の結果本文>
NEXT_STEP: <日本語で次のアクション、不要なら none>
```

### Final Judge出力

```
verdict: "accept" | "reject" | "needs-review"
confidence: 0.00-1.00
reason: <説明>
nextStep: <推奨アクション>
uIntra: <メンバー内不確実性>
uInter: <メンバー間不確実性>
uSys: <システム不確実性>
collapseSignals: [<検出された問題のリスト>]
```

---

## 関連ドキュメント

- [Pi README](/.pi/../README.md)
- [Extensions](/docs/02-user-guide/01-extensions.md)
- [Skills](/docs/04-reference/skill-guide.md)
- [Orchestration Migration Guide v2.0](/.pi/docs/orchestration-migration-v2.md)
- [Agent Runtime](/.pi/extensions/agent-runtime.ts)
- [Subagents Extension](/.pi/extensions/subagents.ts)
- [Agent Teams Extension](/.pi/extensions/agent-teams.ts)
- [Communication Module](/.pi/extensions/agent-teams/communication.ts)
- [Judge Module](/.pi/extensions/agent-teams/judge.ts)
- [Output Schema](/.pi/lib/output-schema.ts)
- [Adaptive Penalty](/.pi/lib/adaptive-penalty.ts)
- [Agent Errors](/.pi/lib/agent-errors.ts)
- [Text Parsing Utils](/.pi/lib/text-parsing.ts)

---

## v2.0.0 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-02-15 | P0-1: JSON Schema契約実装、デフォルトstrict移行 |
| 2026-02-15 | P0-3: Judge説明可能性・重み設定外部化 |
| 2026-02-15 | P1-4: Enhanced Adaptive Penalty（指数減衰・理由別重み） |
| 2026-02-15 | P1-5: 拡張エラー分類（SCHEMA_VIOLATION等） |
| 2026-02-15 | 共通ユーティリティ抽出（text-parsing.ts） |
