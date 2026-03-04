---
id: template-team-guide
name: Phase-Separated Team Template Guide
description: フェーズ分割パターンのチーム作成ガイド。team.md + p1/p2/p3の構造で新しいチームセットを作成する手順を説明。
enabled: disabled
members: []
---

# Phase-Separated Team Template Guide

## 概要

このガイドは、フェーズ分割パターンでチームを作成するためのテンプレートと手順を説明します。

## 重要: ディレクトリ構造ルール

**team.md必須ルール:**
- サブディレクトリに`team.md`（または`TEAM.md`）が存在する場合のみ、`p*.md`が読み込まれます
- `team.md`がない場合、フェーズ別ファイル（p1.md等）は無視されます

```
definitions/
├── [team-name]/
│   ├── team.md     # 統合チーム（必須）
│   ├── p1.md       # Phase 1チーム（team.mdがある場合のみ有効）
│   ├── p2.md       # Phase 2チーム
│   └── p3.md       # Phase 3チーム
```

## フェーズ分割パターンとは

従来の単一チーム・並列実行パターンの問題：
- Phase 1/2/3のメンバーが同時に開始
- 前フェーズの結果なしで作業を開始してしまう
- 重複作業が発生

フェーズ分割パターンでの解決：
- フェーズごとに独立したチームを作成
- 各フェーズを順次実行
- 前フェーズの結果を次フェーズに引き継ぎ

## 核心原則

**鉄の掟:**
```
理解なき実行をしない
計画なき変更を許可しない
```

推測に基づく作業は失敗を招き、品質を低下させる。準備なき実行は手戻りを生み、時間を浪費する。

## テンプレートファイル

| ファイル | 用途 | 必須 |
|---------|------|------|
| `team.md` | 統合チーム定義 | **必須** |
| `p1.md` | Phase 1用テンプレート | 任意 |
| `p2.md` | Phase 2用テンプレート | 任意 |
| `p3.md` | Phase 3用テンプレート | 任意 |

## 新規チーム作成手順

### 1. チーム名を決定

例: `my-feature`

### 2. ディレクトリを作成

```bash
mkdir .pi/extensions/agent-teams/definitions/my-feature
```

### 3. テンプレートをコピー

```bash
# 統合チーム（必須）
cp _templates/team.md my-feature/team.md

# フェーズ別チーム（必要に応じて）
cp _templates/p1.md my-feature/p1.md
cp _templates/p2.md my-feature/p2.md
cp _templates/p3.md my-feature/p3.md
```

### 4. team.mdを編集

```yaml
---
id: my-feature-team
name: "My Feature Team"
description: "My Featureの実装を担当するチーム。Phase 1/2/3で構成。"
enabled: enabled
strategy: parallel
skills:
  - relevant-skill
members:
  - id: overview-member
    role: Overview Member
    description: "統合チームのメンバー"
    enabled: true
---
```

### 5. 各フェーズを編集

#### my-feature/p1.md

```yaml
---
id: my-feature-p1
name: My Feature - Phase 1 [Name]
description: "My Feature Phase 1: [フェーズ名]..."
enabled: enabled
strategy: parallel
members:
  - id: [適切なID]
    role: [役割名]
    description: "[説明]"
---
```

#### my-feature/p2.md

```yaml
---
id: my-feature-p2
name: My Feature - Phase 2 [Name]
description: "My Feature Phase 2: [フェーズ名]..."
enabled: enabled
---
```

#### my-feature/p3.md

```yaml
---
id: my-feature-p3
name: My Feature - Phase 3 [Name]
description: "My Feature Phase 3: [フェーズ名]..."
enabled: enabled
---
```

### 6. 使い方

```javascript
// Phase 1 → Phase 2 → Phase 3 の順次実行
const phase1 = await agent_team_run({
  teamId: "my-feature-p1",
  task: "..."
});

const phase2 = await agent_team_run({
  teamId: "my-feature-p2",
  task: `...\n\nPhase 1 Results:\n${phase1.output}`
});

const phase3 = await agent_team_run({
  teamId: "my-feature-p3",
  task: `...\n\nPhase 1:\n${phase1.output}\n\nPhase 2:\n${phase2.output}`
});
```

## 命名規則

| 要素 | 規則 | 例 |
|-----|------|-----|
| ディレクトリ名 | `[ベース名]` | `core-delivery` |
| 統合チームID | `[ベース名]-team` | `core-delivery-team` |
| フェーズ別ID | `[ベース名]-p[フェーズ番号]` | `core-delivery-p1` |
| 統合チーム名 | `[ベース名] Team` | `Core Delivery Team` |
| フェーズ別名 | `[ベース名] - Phase N [フェーズ名]` | `Core Delivery - Phase 1 Investigation` |
| メンバーID | `[役割を表す名]` | `research-primary` |

## 参考実装

以下のチームを参考にしてください：

| チーム | フェーズ数 | 特徴 |
|-------|----------|------|
| core-delivery | 3 | 汎用開発フロー |
| bug-war-room | 4 | デバッグフロー |
| code-excellence | 3 | レビューフロー |
| design-discovery | 3 | 設計フロー |

## よくある間違い

| 間違い | 結果 | 正しい方法 |
|-------|------|-----------|
| team.mdを作成しない | p*.mdが読み込まれない | 必ずteam.mdを作成 |
| enabled: disabledのまま | チームが表示されない | enabled: enabledに設定 |
| IDにアンダースコア使用 | 一貫性がない | ハイフンを使用 |
| フロントマターなし | パースエラー | ---で囲む |

## エピステミック従順プロトコル（Epistemic Deference Protocol）

> 論文「Multi-Agent Teams Hold Experts Back」の知見に基づく。詳細は `.pi/research/multi-agent-teams-experts-back/improvement-design.md` を参照。

### 核心原則

**専門家の意見を妥協で希釈しない**

マルチエージェントLLMチームは、専門家のパフォーマンスに8-37.6%劣る傾向がある。主な原因は「統合的妥協（Integrative Compromise）」—専門家の意見を非専門家の意見と平均化してしまうこと。

### DISCUSSIONタグ

メンバー間の議論では以下のタグを使用する：

| タグ | 名称 | 使用場面 |
|-----|------|---------|
| **[ED]** | Epistemic Deference | 専門家の判断に従う |
| **[SP]** | Strategic Persistence | 専門家が主張を維持 |
| **[EF]** | Epistemic Flexibility | 新たな証拠で立場を修正 |
| **[IC]** | Integrative Compromise | 中間案の提案（**可能な限り回避**） |

### 専門家の特定

以下のいずれかの条件を満たすメンバーを専門家とみなす：

1. **Phase Owner**: 現在のフェーズの担当者
2. **Skill Holder**: 関連スキルの保持者
3. **High Confidence**: 根拠付きでconfidence > 0.8

### 出力フォーマット

```markdown
## Output

[主要な出力]

## DISCUSSION

### Expertise Assessment
- Phase Owner: [名前] (役割)
- My Role: [expert/non-expert]
- Confidence: [0.0-1.0]

### Position
[ED/SP/EF/IC] <主張>

### Evidence (if SP or EF)
- <具体的な証拠>

### Agreement/Disagreement
- Agree with: [メンバー] on [トピック] - [理由]
- Disagree with: [メンバー] on [トピック] - [証拠付き理由]
```

### タグ使用ガイドライン

#### 非専門家の場合
- **推奨**: `[ED] Researcher's analysis is comprehensive. I defer.`
- **回避**: `[IC] Let's take a middle ground...`

#### 専門家の場合
- **推奨**: `[SP] I maintain my conclusion because [evidence].`
- **条件付き**: `[EF] I revise based on new evidence [X].`
- **回避**: `[IC]` - 専門家は妥協すべきではない

---

## 専門家の戦略的持続性（Strategic Persistence）

### 専門家のルール

現在のフェーズ/トピックの専門家である場合：

1. **専門性を明示**
   ```markdown
   ## Expert Claim
   - **Topic**: [トピック]
   - **My Role**: [なぜ専門家か]
   - **Confidence**: [0.0-1.0]
   - **Conclusion**: [結論]
   ```

2. **証拠を提示（意見ではなく）**
   ```markdown
   ## Evidence
   - **File**: path/to/file.ts:42-58
   - **Function**: functionName()
   - **Documentation**: [リンクまたは引用]
   ```

3. **証拠なしの妥協に抵抗**
   ```markdown
   ## Response to [Member]
   - **Their Proposal**: [要約]
   - **My Position**: MAINTAIN
   - **Reason**: No contradictory evidence presented.
   ```

4. **希釈せず、エスカレート**
   ```markdown
   ## Escalation
   - **Issue**: [不和の説明]
   - **Expert Position**: [専門家の立場]
   - **Dissenting Position**: [反対立場]
   - **Recommendation**: HUMAN_REVIEW_REQUIRED
   ```

### Confidence Threshold

| Confidence | 行動 |
|------------|------|
| **0.9-1.0** | STRONGLY MAINTAIN - 強い証拠なしの反対にはエスカレート |
| **0.7-0.89** | MAINTAIN - 矛盾する証拠があった場合のみ修正 |
| **0.5-0.69** | TENTATIVE - 新情報に基づく修正を受け入れる |
| **0.3-0.49** | UNCERTAIN - 追加の専門知識を求める |
| **0.0-0.29** | DEFER - 他のメンバーがリードすべき |

---

## 意思決定プロトコル（Decision Protocol）

### Phase Owner Has Final Say

各フェーズには最終決定権を持つオーナーがいる：

| フェーズ | オーナー | 決定権限 |
|-------|-------|-------------------|
| Phase 1 (Research) | Researcher | 事実の発見、制約条件、影響範囲 |
| Phase 2 (Implementation) | Implementer | 技術的アプローチ、コード構造 |
| Phase 3 (Review) | Reviewer | リスク許容/却下、品質ゲート |

### 合意形成は不要

- メンバーは意見を提供
- Phase Ownerが決定
- 矛盾する証拠がない限り、他は従う
- 低confidenceの場合はエスカレート

### 決定出力フォーマット

```markdown
## Phase [N] Decision

### Decision Maker
- **Role**: [Phase Owner Role]
- **Member**: [名前]

### Inputs Reviewed
- [Member 1]: [position] - [key point]
- [Member 2]: [position] - [key point]

### Decision
[最終決定]

### Reasoning
- [理由1]
- [理由2]

### Confidence
- **Overall**: [0.0-1.0]
- **Key Uncertainties**: [リスト]

### Escalation (if applicable)
- **Issue**: [説明]
- **Recommendation**: HUMAN_REVIEW_REQUIRED
```

---

## Decision Mode Selection

| タスクタイプ | Decision Mode | 理由 |
|-----------|--------------|--------|
| コード実装 | Expert-decides | 品質重視 |
| セキュリティ監査 | Majority-vote | ロバスト性重視 |
| バグ調査 | Expert-decides | 正確性重視 |
| ドキュメント | Consensus | バランス型 |
| 外部入力処理 | Majority-vote | 敵対的入力のフィルタリング |

### セキュリティクリティカルな決定

セキュリティ関連の決定では **Majority-Vote with Veto** を使用：

- 各メンバーが投票: APPROVE / REJECT / VETO
- VETOは他のすべての票を無効化
- VETOなしの場合: 単純多数決

---

## クイックリファレンス

| フェーズ | 主要活動 | 成功基準 |
|-------|---------------|------------------|
| **Phase 1** | 担当領域の独立したスライスの分析 | 特定視点からの発見が明確 |
| **Phase 2** | 実装・詳細設計の実行 | 計画に基づく実装が完了 |
| **Phase 3** | 統合・レビュー・品質保証 | 実行可能な統合計画 |

### エピステミック従順のクイックリファレンス

| 状況 | 推奨アクション |
|------|--------------|
| 自分が専門家 | [SP] で主張を維持、証拠を提示 |
| 他者が専門家 | [ED] で従う、または矛盾する証拠を提示 |
| 証拠がない | [IC] は避ける、エスカレートを検討 |
| Confidence < 0.7 | 人間レビューを推奨 |
