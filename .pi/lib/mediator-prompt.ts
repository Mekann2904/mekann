/**
 * @abdd.meta
 * path: .pi/lib/mediator-prompt.ts
 * role: Mediator層のプロンプトテンプレートモジュール
 * why: 論文Section 4のMediator-Assistantアーキテクチャに基づき、意図明確化のためのプロンプトを生成する
 * related: .pi/lib/intent-mediator.ts, .pi/lib/mediator-types.ts
 * public_api: MEDIATOR_SYSTEM_PROMPT, buildInterpretationPrompt, buildClarificationPrompt, buildStructuringPrompt, LIC_DETECTION_PROMPT
 * invariants: プロンプトは論文のEquation (5)に従い履歴ℋを含む
 * side_effects: なし（純粋なテンプレート生成）
 * failure_modes: テンプレート変数の欠落、フォーマット崩れ
 * @abdd.explain
 * overview: MediatorがLLMを使用して意図を解釈・明確化するためのプロンプトテンプレートを提供
 * what_it_does:
 *   - システムプロンプトの定義
 *   - 意図解釈用プロンプトの構築
 *   - 明確化質問生成用プロンプトの構築
 *   - 構造化指示生成用プロンプトの構築
 *   - LiC検出用プロンプトの構築
 * why_it_exists:
 *   - 論文のMediatorパターンをtraining-freeで実現するため
 *   - 一貫性のあるプロンプトフォーマットを保証するため
 * scope:
 *   in: ユーザー入力、会話履歴、確認済み事実
 *   out: LLMに送信するプロンプト文字列
 */

import {
  type Message,
  type ConfirmedFact,
  type InformationGap,
  type StructuredIntent,
  type MediatorQuestion,
  type InformationGapType,
} from "./mediator-types.js";

// ============================================================================
// システムプロンプト
// ============================================================================

/**
 * Mediatorシステムプロンプト
 * 
 * 論文「Intent Mismatch」のMediatorの役割:
 * 1. ユーザーの入力を解釈し、暗黙の前提を明示化
 * 2. 情報が不足している場合、明確化を求める
 * 3. 十分な情報が得られたら、構造化された指示を生成
 * 
 * training-freeパラダイム:
 * - パラメータ更新なし
 * - インコンテキスト履歴のみを使用
 */
export const MEDIATOR_SYSTEM_PROMPT = `# Intent Mediator

あなたはユーザーとAIエージェントの間の仲介者（Mediator）です。

## 役割

ユーザーの曖昧な入力を解釈し、AIエージェントが実行可能な形式に変換します。

### 核心原則

1. **意図推論と実行の分離** (Equation 3)
   - まずユーザーの意図を理解する
   - その後で実行可能な指示を構築する

2. **履歴からの情報統合** (Equation 5)
   - 過去の会話から文脈を復元
   - 確認済みの事実を活用
   - ユーザーの表現習慣（プラグマティクス）を考慮

3. **曖昧さの明確化**
   - 情報が不足している場合は質問する
   - 推測は最小限にし、確認を優先

4. **training-free動作**
   - 学習は行わない
   - 提供されたコンテキストのみを使用

## 出力ルール

1. 日本語で回答
2. 推測には必ず「（推測）」と明記
3. 確認が必要な点は明示的にリストアップ
4. 構造化指示は指定されたフォーマットに従う

## 注意点

- 「あれ」「それ」などの指示語は文脈から解決
- 専門用語は文脈に応じて解釈
- ユーザーの専門レベルに合わせた表現を維持
- 暗黙の前提を推論して明示化`;

// ============================================================================
// 意図解釈プロンプト
// ============================================================================

/**
 * 意図解釈プロンプトの入力
 */
export interface InterpretationPromptInput {
  userMessage: string;
  conversationHistory: Message[];
  confirmedFacts: ConfirmedFact[];
  taskContext?: string;
}

/**
 * 意図解釈プロンプトを構築
 * @summary ユーザー入力の解釈用プロンプトを生成
 * @param input プロンプト入力データ
 * @returns 完全なプロンプト文字列
 */
export function buildInterpretationPrompt(input: InterpretationPromptInput): string {
  const sections: string[] = [];

  // タスクコンテキスト（ある場合）
  if (input.taskContext) {
    sections.push(`## タスクコンテキスト
${input.taskContext}`);
  }

  // 会話履歴
  if (input.conversationHistory.length > 0) {
    sections.push(`## 会話履歴（直近の文脈）
${formatConversationHistory(input.conversationHistory)}`);
  }

  // 確認済み事実
  if (input.confirmedFacts.length > 0) {
    sections.push(`## 確認済み事実
${formatConfirmedFacts(input.confirmedFacts)}`);
  }

  // ユーザー入力
  sections.push(`## ユーザー入力
\`\`\`
${input.userMessage}
\`\`\``);

  // 質問
  sections.push(`## 解釈指示

以下の形式で回答してください：

### 1. 解釈結果
ユーザーが何を求めているか、あなたの理解を記述してください。
暗黙の前提がある場合は明示化してください。

### 2. 参照解決
「あれ」「それ」「この」などの指示語があれば、何を指しているかを特定してください。
- 曖昧な参照: [リストアップ]
- 解決された参照: [キー] = [値]

### 3. 情報ギャップ
不足している情報を特定してください：
- 種別: [ambiguous_reference | missing_target | unclear_action | missing_constraints | unclear_success_criteria | context_mismatch | implicit_assumption]
- 用語: [曖昧な用語]
- 説明: [何が不明か]
- 重要度: [low | medium | high]

### 4. 信頼度
この解釈の信頼度を0.0-1.0で評価してください。`);

  return sections.join("\n\n");
}

// ============================================================================
// 明確化質問生成プロンプト
// ============================================================================

/**
 * 明確化質問生成プロンプトの入力
 */
export interface ClarificationPromptInput {
  userMessage: string;
  interpretation: string;
  gaps: InformationGap[];
}

/**
 * 明確化質問生成プロンプトを構築
 * @summary 情報ギャップを埋めるための質問を生成
 * @param input プロンプト入力データ
 * @returns 完全なプロンプト文字列
 */
export function buildClarificationPrompt(input: ClarificationPromptInput): string {
  return `## 明確化質問の生成

### 元の入力
\`\`\`
${input.userMessage}
\`\`\`

### 現在の解釈
${input.interpretation}

### 特定された情報ギャップ
${formatInformationGaps(input.gaps)}

### 指示

上記の情報ギャップを埋めるための質問を生成してください。
各質問は以下の形式に従ってください：

\`\`\`json
{
  "header": "短いラベル（最大30文字）",
  "question": "完全な質問文",
  "options": [
    {"label": "選択肢1", "description": "説明"},
    {"label": "選択肢2", "description": "説明"}
  ],
  "multiple": false,
  "custom": true,
  "relatedGap": "ギャップの種別"
}
\`\`\`

### 制約

1. 最大3つの質問まで
2. 各質問は2-4つの選択肢を持つ
3. 自由記述を許可する場合はcustomをtrueに
4. 質問は簡潔かつ具体的に
5. ユーザーの専門レベルに合わせる`;
}

// ============================================================================
// 構造化指示生成プロンプト
// ============================================================================

/**
 * 構造化指示生成プロンプトの入力
 */
export interface StructuringPromptInput {
  userMessage: string;
  interpretation: string;
  clarifications?: Array<{ question: string; answer: string }>;
  conversationHistory: Message[];
  confirmedFacts: ConfirmedFact[];
}

/**
 * 構造化指示生成プロンプトを構築
 * @summary 実行可能な構造化指示を生成
 * @param input プロンプト入力データ
 * @returns 完全なプロンプト文字列
 */
export function buildStructuringPrompt(input: StructuringPromptInput): string {
  const sections: string[] = [];

  sections.push(`## 構造化指示の生成

### 元の入力
\`\`\`
${input.userMessage}
\`\`\`

### 解釈結果
${input.interpretation}`);

  // 明確化の結果（ある場合）
  if (input.clarifications && input.clarifications.length > 0) {
    sections.push(`### 明確化の結果
${input.clarifications.map(c => `- Q: ${c.question}\n  A: ${c.answer}`).join("\n")}`);
  }

  // 確認済み事実
  if (input.confirmedFacts.length > 0) {
    sections.push(`### 確認済み事実
${formatConfirmedFacts(input.confirmedFacts)}`);
  }

  sections.push(`### 出力形式

以下のJSON形式で構造化指示を出力してください：

\`\`\`json
{
  "target": {
    "files": ["対象ファイルのパス"],
    "modules": ["対象モジュール"],
    "functions": ["対象関数"],
    "scope": "スコープの説明"
  },
  "action": {
    "type": "create | modify | delete | query | analyze | execute | debug | document | test | refactor | review",
    "description": "アクションの説明",
    "steps": ["ステップ1", "ステップ2"],
    "priority": "low | medium | high | critical"
  },
  "constraints": {
    "mustPreserve": ["維持すべき事項"],
    "mustSatisfy": ["満たすべき条件"],
    "avoid": ["避けるべき事項"],
    "assumptions": ["想定・前提"]
  },
  "successCriteria": {
    "criteria": ["成功基準1", "成功基準2"],
    "verificationMethod": "検証方法",
    "acceptanceTests": ["受け入れテスト"]
  },
  "confidence": 0.85,
  "clarificationNeeded": false,
  "interpretationBasis": ["根拠1", "根拠2"]
}
\`\`\`

### 制約

1. 不明な情報は空配列またはnullにする
2. confidenceは情報の充足度に基づいて設定
3. clarificationNeededは、さらに確認が必要な場合true`);
  sections.push("");

  return sections.join("\n\n");
}

// ============================================================================
// LiC検出プロンプト
// ============================================================================

/**
 * LiC検出プロンプトの入力
 */
export interface LiCDetectionPromptInput {
  recentOutputs: string[];
  conversationHistory: Message[];
}

/**
 * LiC検出プロンプトを構築
 * @summary Lost in Conversation現象を検出
 * @param input プロンプト入力データ
 * @returns 完全なプロンプト文字列
 */
export function buildLicDetectionPrompt(input: LiCDetectionPromptInput): string {
  return `## LiC（Lost in Conversation）検出

### 背景

マルチターン会話において、AIは以下の問題を起こしやすい：
1. ユーザーの真の意図から徐々に乖離する
2. 「平均的なユーザー」の事前分布にフォールバックする
3. 文脈の一部を無視する

### 会話履歴
${formatConversationHistory(input.conversationHistory.slice(-10))}

### 最近のAI出力
${input.recentOutputs.map((o, i) => `### 出力 ${i + 1}\n${o.slice(0, 500)}...`).join("\n\n")}

### 検出指示

以下の兆候があるかどうかを判定してください：

1. **汎用的な回答**: 具体的な文脈を無視した一般的な回答
2. **文脈無視**: 明示された制約や要件の無視
3. **前提不一致**: ユーザーの想定と異なる前提で回答
4. **トピック逸脱**: 元の質問から外れた方向へ

### 出力形式

\`\`\`json
{
  "detected": true/false,
  "severity": "low | medium | high",
  "evidence": ["兆候1", "兆候2"],
  "recommendedAction": "continue | mediate | abort",
  "driftScore": 0.0-1.0
}
\`\`\``;
}

/**
 * LiC検出用定数プロンプト
 */
export const LIC_DETECTION_PROMPT = `# LiC Detection System

Lost in Conversation (LiC) 現象は、マルチターン会話でAIの性能が低下する問題。

## 検出パターン

1. **Generic Convergence** (汎用収束)
   - 具体的な文脈を無視した一般的な回答
   - 「平均的なユーザー」向けのデフォルト応答

2. **Context Drift** (文脈ドリフト)
   - 初期の制約が徐々に無視される
   - 会話の方向性が変わる

3. **Assumption Lock** (前提ロック)
   - 最初の誤った前提を修正しない
   - ユーザーの修正を無視

4. **Over-Clarification** (過度な確認)
   - 既に明確な情報について再確認
   - 文脈の理解不足を示唆

5. **Topic Drift** (トピック逸脱)
   - 元の質問から関連性の低い方向へ
   - 副次的な話題に集中しすぎる`;

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 会話履歴をフォーマット
 * @summary メッセージリストを読みやすい形式に変換
 * @param messages メッセージリスト
 * @returns フォーマットされたテキスト
 */
function formatConversationHistory(messages: Message[]): string {
  if (messages.length === 0) {
    return "（履歴なし）";
  }

  return messages
    .map(m => {
      const role = {
        user: "ユーザー",
        assistant: "AI",
        mediator: "Mediator",
        system: "システム",
      }[m.role] || m.role;
      
      const timestamp = new Date(m.timestamp).toLocaleTimeString("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
      });
      
      const content = m.content.length > 200 
        ? m.content.slice(0, 200) + "..."
        : m.content;
      
      return `[${timestamp}] ${role}: ${content}`;
    })
    .join("\n");
}

/**
 * 確認済み事実をフォーマット
 * @summary 事実リストを読みやすい形式に変換
 * @param facts 確認済み事実リスト
 * @returns フォーマットされたテキスト
 */
function formatConfirmedFacts(facts: ConfirmedFact[]): string {
  if (facts.length === 0) {
    return "（確認済み事実なし）";
  }

  return facts
    .map(f => `- **${f.key}**: ${f.value}`)
    .join("\n");
}

/**
 * 情報ギャップをフォーマット
 * @summary ギャップリストを読みやすい形式に変換
 * @param gaps 情報ギャップリスト
 * @returns フォーマットされたテキスト
 */
function formatInformationGaps(gaps: InformationGap[]): string {
  if (gaps.length === 0) {
    return "（情報ギャップなし）";
  }

  return gaps
    .map((g, i) => {
      const candidates = g.candidates 
        ? `\n  候補: ${g.candidates.map(c => c.value).join(", ")}`
        : "";
      return `${i + 1}. [${g.severity}] ${g.type}: ${g.term}\n   ${g.description}${candidates}`;
    })
    .join("\n");
}

/**
 * 質問候補を生成
 * @summary ギャップタイプに基づく質問テンプレートを返す
 * @param gapType ギャップの種別
 * @returns 質問テンプレート
 */
export function getQuestionTemplate(gapType: InformationGapType): {
  headerTemplate: string;
  questionTemplate: string;
  optionTemplates: Array<{ label: string; description: string }>;
} {
  const templates: Record<InformationGapType, {
    headerTemplate: string;
    questionTemplate: string;
    optionTemplates: Array<{ label: string; description: string }>;
  }> = {
    ambiguous_reference: {
      headerTemplate: "参照先",
      questionTemplate: "「{term}」は何を指していますか？",
      optionTemplates: [
        { label: "直前の話題", description: "会話で直前に言及されたもの" },
        { label: "ファイル", description: "特定のファイル" },
        { label: "機能", description: "特定の機能やモジュール" },
      ],
    },
    missing_target: {
      headerTemplate: "対象",
      questionTemplate: "どのファイルやモジュールを対象にしますか？",
      optionTemplates: [
        { label: "現状維持", description: "既存の対象をそのまま" },
        { label: "新規作成", description: "新しいファイルを作成" },
        { label: "全対象", description: "プロジェクト全体" },
      ],
    },
    unclear_action: {
      headerTemplate: "アクション",
      questionTemplate: "どのような変更をしますか？",
      optionTemplates: [
        { label: "修正", description: "バグやエラーの修正" },
        { label: "追加", description: "新機能の追加" },
        { label: "改善", description: "リファクタリングや最適化" },
      ],
    },
    missing_constraints: {
      headerTemplate: "制約",
      questionTemplate: "以下の制約は必要ですか？",
      optionTemplates: [
        { label: "必要", description: "この制約を適用" },
        { label: "不要", description: "制約なし" },
        { label: "一部", description: "条件付きで適用" },
      ],
    },
    unclear_success_criteria: {
      headerTemplate: "成功基準",
      questionTemplate: "完了の判定基準は何ですか？",
      optionTemplates: [
        { label: "テスト通過", description: "自動テストが全て通る" },
        { label: "動作確認", description: "手動で動作を確認" },
        { label: "レビュー", description: "コードレビューで承認" },
      ],
    },
    context_mismatch: {
      headerTemplate: "文脈",
      questionTemplate: "以前の文脈を引き継ぎますか？",
      optionTemplates: [
        { label: "引き継ぐ", description: "前の会話を継続" },
        { label: "新規", description: "新しいタスクとして開始" },
        { label: "一部", description: "関連部分のみ引き継ぐ" },
      ],
    },
    implicit_assumption: {
      headerTemplate: "前提",
      questionTemplate: "以下の前提で進めて良いですか？",
      optionTemplates: [
        { label: "はい", description: "前提を確認" },
        { label: "いいえ", description: "前提を修正" },
        { label: "確認", description: "詳細を確認したい" },
      ],
    },
  };

  return templates[gapType];
}

/**
 * 質問を生成
 * @summary 情報ギャップからMediatorQuestionを生成
 * @param gap 情報ギャップ
 * @returns Mediator質問
 */
export function generateQuestion(gap: InformationGap): MediatorQuestion {
  const template = getQuestionTemplate(gap.type);
  
  // テンプレートの変数を置換
  let questionText = template.questionTemplate.replace("{term}", gap.term);
  
  // 候補がある場合は選択肢に追加
  let options = [...template.optionTemplates];
  if (gap.candidates && gap.candidates.length > 0) {
    options = gap.candidates.slice(0, 4).map(c => ({
      label: c.value.length > 5 ? c.value.slice(0, 5) : c.value,
      description: c.description,
    }));
  }

  return {
    header: template.headerTemplate,
    question: questionText,
    options,
    multiple: false,
    custom: true,
    relatedGap: gap.type,
  };
}

/**
 * 全体の信頼度を計算
 * @summary 各要素の充足度から全体の信頼度を算出
 * @param interpretation 解釈の信頼度
 * @param gapsRemaining 残存する情報ギャップ数
 * @param factsUsed 使用した確認済み事実数
 * @returns 全体の信頼度
 */
export function calculateOverallConfidence(
  interpretation: string,
  gapsRemaining: number,
  factsUsed: number
): number {
  // ベース信頼度
  let confidence = 0.5;

  // 解釈の長さによる調整（ある程度の長さがある＝詳細な解釈）
  if (interpretation.length > 100) {
    confidence += 0.1;
  }
  if (interpretation.length > 300) {
    confidence += 0.1;
  }

  // 使用した事実による調整
  confidence += Math.min(factsUsed * 0.05, 0.2);

  // 残存ギャップによる調整
  confidence -= Math.min(gapsRemaining * 0.15, 0.4);

  // 範囲内にクリップ
  return Math.max(0, Math.min(1, confidence));
}
