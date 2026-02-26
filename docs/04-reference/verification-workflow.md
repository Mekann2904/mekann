---
title: 検証ワークフロー設定
category: reference
audience: developer
last_updated: 2026-02-26
tags: [verification, repoaudit, inspector, challenger]
related: [.pi/lib/verification-workflow.ts, .pi/skills/bug-hunting/SKILL.md]
---

# 検証ワークフロー設定

RepoAudit論文のValidatorレイヤーに基づく検証システムの設定ガイド。

## 概要

検証ワークフローは、LLMエージェントの出力を自動的に検証するためのシステム。Inspector（バイアス検出）とChallenger（欠陥指摘）の2つのサブエージェントによる二重検証メカニズムを実装。

## 検証モード

| モード | ユースケース | トリガー動作 |
|--------|-------------|-------------|
| `disabled` | デフォルト、生成時品質保証 | トリガーしない |
| `repoaudit` | コード監査ワークフロー | post-subagent、低信頼度、高リスク |
| `high-stakes-only` | 本番安全性重視 | 破壊的/本番操作のみ |
| `explicit-only` | 手動検証 | 明示的リクエストのみ |

## 設定

### 環境変数

```bash
# V2モード（推奨）
export PI_VERIFICATION_MODE="repoaudit"

# 従来の環境変数（後方互換性）
export PI_VERIFICATION_WORKFLOW_MODE="strict"  # repoauditと同等
export PI_VERIFICATION_WORKFLOW_MODE="minimal" # high-stakes-onlyと同等
```

### プログラムによる設定

```typescript
import { resolveVerificationConfigV2, VerificationMode } from "./lib/verification-workflow.js";

// モードベースで設定を取得
const config = resolveVerificationConfigV2("repoaudit");

// 環境変数からモードを取得
import { getVerificationModeFromEnv } from "./lib/verification-workflow.js";
const mode = getVerificationModeFromEnv();
```

## 統合ポイント

### post-subagent統合

サブエージェント実行後に自動的に検証をトリガー：

```typescript
// サブエージェント実行後
const result = await subagentRun(...);

// 低信頼度の場合は検証
if (result.confidence < 0.7 && config.integrationPoints?.postSubagent) {
  const verification = await runVerification(result.output, context);
  if (!verification.passed) {
    // 再実行または警告
  }
}
```

### post-team統合

チーム実行後のコンセンサス検証：

```typescript
// チーム実行後
const teamResult = await runTeamTask(...);

// コミュニケーションフェーズ後の検証
if (config.integrationPoints?.postTeam) {
  const verification = await verifyTeamConsensus(teamResult);
  result.verification = verification;
}
```

## Inspectorパターン

Inspectorは出力内のバイアスや不審なパターンを検出：

| パターン | 説明 |
|---------|------|
| `claim-result-mismatch` | CLAIMとRESULTの不一致 |
| `evidence-confidence-gap` | 証拠と信頼度のミスマッチ |
| `first-reason-stopping` | 第1理由で探索停止（バグハンティング） |
| `proximity-bias` | 近接性バイアス |
| `concreteness-bias` | 具体性バイアス |
| `palliative-fix` | 対症療法的修正 |

## Challengerパターン

Challengerは主張に挑戦し、欠陥を指摘：

| カテゴリ | 説明 |
|---------|------|
| `evidence-gap` | 証拠の欠落 |
| `logical-flaw` | 論理的欠陥 |
| `assumption` | 隠れた仮定 |
| `alternative` | 代替解釈の未考慮 |
| `boundary` | 境界条件の未考慮 |
| `causal-reversal` | 因果関係の逆転 |

## RepoAudit統合

RepoAudit論文の3層アーキテクチャとの対応：

```
RepoAudit                  mekann
─────────                  ──────
Initiator        →         bug-hunting (仮説生成)
Explorer         →         repograph-localization (需要駆動探索)
Validator        →         verification-workflow (検証)
```

### 設定例

```typescript
// RepoAuditスタイルの完全設定
const repoAuditConfig = {
  verification: resolveVerificationConfigV2("repoaudit"),
  exploration: {
    maxDepth: 5,
    timeout: 60000,
    cacheTTL: 300000,
  },
  phases: {
    initiator: { enabled: true },
    explorer: { enabled: true, demandDriven: true },
    validator: { enabled: true, mode: "repoaudit" },
  },
};
```

## トレードオフ

### 監視 vs 気づき

検証システムは「パノプティコン的監視」と「仏教的気づき（sati）」の緊張関係にある：

| 監視的アプローチ（回避） | 気づきのアプローチ（推奨） |
|------------------------|-------------------------|
| 欠陥を探して排除する | 現れているものを認識する |
| 常にスキャンする義務 | 気づいたときに認識する |
| 無欠陥を理想として課す | 欠陥を「非自己」として認識する |

### 推奨される使用方法

1. **デフォルトは無効**: 生成時品質保証を優先
2. **オプトインで有効化**: 明示的なモード選択
3. **高リスクのみ**: `high-stakes-only`で最小限の干渉
4. **学習ツールとして**: 検出結果を「改善指摘」ではなく「気づき」として扱う

## トラブルシューティング

| 症状 | 原因 | 解決策 |
|------|------|--------|
| 過剰な検証トリガー | 閾値が低すぎる | `minConfidenceToSkipVerification`を上げる |
| 検証されない | モードがdisabled | `PI_VERIFICATION_MODE`を確認 |
| 誤検知が多い | パターンが厳しすぎる | `requiredPatterns`を調整 |

## 関連ファイル

- 実装: `.pi/lib/verification-workflow.ts`
- スキル: `.pi/skills/bug-hunting/SKILL.md`
- RepoGraph: `.pi/skills/repograph-localization/SKILL.md`
