// /Users/mekann/github/pi-plugin/mekann/.pi/lib/prompt-templates.ts
// このファイルは、エージェントへ自動注入する共通プロンプトテンプレートを定義します。
// なぜ存在するか: 推論の型を共通化し、トークン効率を保ちながら判断品質を上げるためです。
// 関連ファイル: /Users/mekann/github/pi-plugin/mekann/.pi/extensions/subagents.ts, /Users/mekann/github/pi-plugin/mekann/.factory/droids/planner.md, /Users/mekann/github/pi-plugin/mekann/.factory/droids/verifier.md
/**
 * @abdd.meta
 * path: .pi/lib/prompt-templates.ts
 * role: プロンプトテンプレートの管理とトークン最適化
 * why: 重複する命令ブロックをテンプレート化し、LLMプロンプトのトークン効率を向上させるため
 * related: .pi/extensions/subagents.ts, .pi/lib/dag-executor.ts
 * public_api: PromptTemplate, PROMPT_TEMPLATES, buildPromptWithTemplates, getTemplatesForAgent
 * invariants: テンプレートIDは一意、ハッシュは内容と整合
 * side_effects: なし（純粋関数）
 * failure_modes: 不正なテンプレートID指定
 * @abdd.explain
 * overview: サブエージェント実行時の重複プロンプトをテンプレート化し、トークン使用量を削減する
 * what_it_does:
 *   - プロンプトテンプレートの定義と管理
 *   - エージェントタイプ別のテンプレート選択
 *   - テンプレート参照を用いたプロンプト構築
 * why_it_exists:
 *   - 並列サブエージェント実行時のトークン重複を回避する
 *   - LLMプロバイダーのプロンプトキャッシングを活用する
 * scope:
 *   in: テンプレートID、カスタムコンテンツ
 *   out: 構築されたプロンプト文字列
 */

// File: .pi/lib/prompt-templates.ts
// Description: Prompt template management for token optimization.
// Why: Deduplicates instruction blocks across subagent prompts, enabling LLM prompt caching.
// Related: .pi/extensions/subagents.ts, .pi/lib/dag-executor.ts

import { createHash } from "node:crypto";

/**
 * プロンプトテンプレートのカテゴリ
 * @summary テンプレートカテゴリ
 */
export type TemplateCategory = "role" | "instruction" | "checklist" | "policy";

/**
 * プロンプトテンプレートの定義
 * @summary プロンプトテンプレート
 */
export interface PromptTemplate {
  /** テンプレートID */
  id: string;
  /** コンテンツのSHA256ハッシュ */
  hash: string;
  /** テンプレートの内容 */
  content: string;
  /** カテゴリ */
  category: TemplateCategory;
  /** 推定トークン数 */
  estimatedTokens: number;
}

/**
 * コンテンツのSHA256ハッシュを計算
 * @summary ハッシュ計算
 * @param content - 対象コンテンツ
 * @returns SHA256ハッシュ（先頭16文字）
 */
function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * プロアクティブ委譲ポリシーテンプレート
 * @summary 委譲ポリシー
 */
const PROACTIVE_DELEGATION_CONTENT = `## Proactive Multi-Agent Execution Policy (MANDATORY)

### Default Stance

Default to direct execution in the current pi turn.

Do not introduce delegation, parallelism, or DAG planning unless the task actually benefits from it.

### Use Direct Execution When

- The task is a focused bug fix
- The task is mainly file inspection or local debugging
- One agent can complete the work without handoff overhead
- Adding orchestration would cost more than it saves

### Consider Delegation When

- The task has clearly separable workstreams
- A review, research, or validation track can run independently
- You need an explicit dependency graph to avoid coordination mistakes
- The task is large enough that handoff cost is justified

### Tool Choice

1. Start with direct execution.
2. If one focused delegated lane is clearly helpful, create the smallest explicit delegated run you can.
3. Use \`subagent_run_dag\` only when dependency-aware orchestration is truly needed.

Do not treat delegation as mandatory.
Do not assume DAG is faster for inspection, debugging, or ordinary bug fixes.`;

/**
 * 品質チェックリストテンプレート
 * @summary 品質チェックリスト
 */
const QUALITY_CHECKLIST_CONTENT = `## Quality Checklist (MANDATORY)

Before completing your task, verify:

- [ ] Code compiles without errors
- [ ] No TypeScript errors (run \`tsc --noEmit\` if applicable)
- [ ] Tests pass (if tests exist)
- [ ] No hardcoded secrets or credentials
- [ ] Error handling is complete
- [ ] Edge cases are considered
- [ ] Documentation is updated (if applicable)`;

/**
 * 認知バイアス防止テンプレート
 * @summary バイアス防止
 */
const COGNITIVE_BIAS_PREVENTION_CONTENT = `## Cognitive Bias Prevention

Be aware of these biases during execution:

1. **Confirmation Bias**: Seek evidence that contradicts your initial hypothesis
2. **Sunk Cost Fallacy**: Don't continue down a wrong path just because you've invested time
3. **Availability Heuristic**: Consider alternatives beyond what immediately comes to mind
4. **Anchoring Bias**: Re-evaluate initial estimates with new information`;

/**
 * Semi-formal reasoning テンプレート
 * @summary 構造化推論
 */
const SEMI_FORMAL_REASONING_CONTENT = `## Semi-formal Reasoning Policy (MANDATORY)

Do not jump from a diff, symbol name, or intuition to a conclusion.

For code reasoning, review, debugging, verification, and planning tasks, structure your reasoning as a lightweight certificate:

1. **DEFINITIONS**: State the exact success condition or equivalence condition.
2. **PREMISES**: List the concrete facts you verified from files, with file paths or symbols.
3. **TRACE**: Walk the relevant execution path, control flow, or data flow step by step.
4. **ALTERNATIVE / COUNTEREXAMPLE**: Check at least one opposing hypothesis or failing path.
5. **CONCLUSION**: Derive the result only from the premises and trace.

Rules:
- If behavior depends on another function, read that function before claiming behavior.
- If you claim two implementations are equivalent, explain why no observed test or caller sees a difference.
- If you claim something breaks, name the concrete caller, test, or path that breaks.
- Mark uncertainty explicitly when source evidence is incomplete.

Preferred output labels when the task is analysis-heavy:
- DEFINITIONS
- PREMISES
- TRACE
- COUNTEREXAMPLE or NO COUNTEREXAMPLE FOUND
- CONCLUSION`;

/**
 * 出力フォーマット要件テンプレート
 * @summary 出力フォーマット
 */
const OUTPUT_FORMAT_CONTENT = `## Output Format Requirements

- Use structured sections with clear headers
- Include code examples where appropriate
- Summarize key decisions and trade-offs
- List any remaining issues or follow-up tasks`;

/**
 * 事前定義テンプレートのマップ
 * @summary テンプレートマップ
 */
export const PROMPT_TEMPLATES: Map<string, PromptTemplate> = new Map([
  [
    "proactive-delegation",
    {
      id: "proactive-delegation",
      hash: computeHash(PROACTIVE_DELEGATION_CONTENT),
      content: PROACTIVE_DELEGATION_CONTENT,
      category: "policy",
      estimatedTokens: 500,
    },
  ],
  [
    "quality-checklist",
    {
      id: "quality-checklist",
      hash: computeHash(QUALITY_CHECKLIST_CONTENT),
      content: QUALITY_CHECKLIST_CONTENT,
      category: "checklist",
      estimatedTokens: 150,
    },
  ],
  [
    "cognitive-bias-prevention",
    {
      id: "cognitive-bias-prevention",
      hash: computeHash(COGNITIVE_BIAS_PREVENTION_CONTENT),
      content: COGNITIVE_BIAS_PREVENTION_CONTENT,
      category: "instruction",
      estimatedTokens: 100,
    },
  ],
  [
    "semi-formal-reasoning",
    {
      id: "semi-formal-reasoning",
      hash: computeHash(SEMI_FORMAL_REASONING_CONTENT),
      content: SEMI_FORMAL_REASONING_CONTENT,
      category: "instruction",
      estimatedTokens: 220,
    },
  ],
  [
    "output-format",
    {
      id: "output-format",
      hash: computeHash(OUTPUT_FORMAT_CONTENT),
      content: OUTPUT_FORMAT_CONTENT,
      category: "instruction",
      estimatedTokens: 60,
    },
  ],
]);

/**
 * エージェントタイプ別のデフォルトテンプレート設定
 * @summary エージェント別テンプレート
 */
const AGENT_TEMPLATE_MAP: Record<string, string[]> = {
  // デフォルト: 全エージェント共通
  default: ["proactive-delegation", "quality-checklist", "semi-formal-reasoning"],
  // 実装エージェント: 品質重視
  implementer: ["proactive-delegation", "quality-checklist", "semi-formal-reasoning", "output-format"],
  // レビューアー: バイアス防止重視
  reviewer: ["cognitive-bias-prevention", "quality-checklist", "semi-formal-reasoning", "output-format"],
  // アナリスト: バイアス防止重視
  analyst: ["cognitive-bias-prevention", "semi-formal-reasoning", "output-format"],
  // プランナー: 委譲重視
  planner: ["proactive-delegation", "cognitive-bias-prevention", "semi-formal-reasoning"],
  // テスター: 品質重視
  tester: ["quality-checklist", "semi-formal-reasoning", "output-format"],
};

/**
 * テンプレートIDを指定してプロンプトを構築
 * @summary テンプレート付きプロンプト構築
 * @param templateIds - テンプレートIDの配列
 * @param customContent - カスタムコンテンツ
 * @param options - オプション
 * @returns 構築されたプロンプト
 * @example
 * const prompt = buildPromptWithTemplates(
 *   ["proactive-delegation", "quality-checklist"],
 *   "## Task\nImplement the feature..."
 * );
 */
export function buildPromptWithTemplates(
  templateIds: string[],
  customContent: string,
  options: {
    /** セパレーター（デフォルト: "---"） */
    separator?: string;
    /** テンプレート間の区切り（デフォルト: "\n\n"） */
    templateSeparator?: string;
  } = {},
): string {
  const { separator = "---", templateSeparator = "\n\n" } = options;

  const templateSections: string[] = [];

  for (const id of templateIds) {
    const template = PROMPT_TEMPLATES.get(id);
    if (template) {
      templateSections.push(template.content);
    } else {
      console.warn(`[prompt-templates] Unknown template ID: ${id}`);
    }
  }

  const combinedTemplates = templateSections.join(templateSeparator);

  if (combinedTemplates.length === 0) {
    return customContent;
  }

  return `${separator}\n${combinedTemplates}\n${separator}\n\n${customContent}`;
}

/**
 * エージェントIDに基づいて推奨テンプレートを取得
 * @summary エージェント用テンプレート取得
 * @param agentId - エージェントID
 * @returns テンプレートIDの配列
 * @example
 * const templates = getTemplatesForAgent("implementer");
 * // Returns: ["proactive-delegation", "quality-checklist", "output-format"]
 */
export function getTemplatesForAgent(agentId: string): string[] {
  return AGENT_TEMPLATE_MAP[agentId] ?? AGENT_TEMPLATE_MAP.default;
}

/**
 * テンプレートの推定トークン数を計算
 * @summary トークン数推定
 * @param templateIds - テンプレートIDの配列
 * @returns 推定トークン数
 */
export function estimateTemplateTokens(templateIds: string[]): number {
  return templateIds.reduce((sum, id) => {
    const template = PROMPT_TEMPLATES.get(id);
    return sum + (template?.estimatedTokens ?? 0);
  }, 0);
}

/**
 * テンプレートのハッシュを一括取得
 * プロンプトキャッシングの識別子として使用
 * @summary テンプレートハッシュ取得
 * @param templateIds - テンプレートIDの配列
 * @returns 結合ハッシュ
 */
export function getTemplatesHash(templateIds: string[]): string {
  const hashes = templateIds
    .map((id) => PROMPT_TEMPLATES.get(id)?.hash ?? "")
    .filter((h) => h.length > 0)
    .join(":");

  return computeHash(hashes);
}

/**
 * カスタムテンプレートを追加
 * @summary カスタムテンプレート追加
 * @param template - テンプレート定義
 */
export function registerTemplate(template: Omit<PromptTemplate, "hash">): void {
  const hash = computeHash(template.content);
  PROMPT_TEMPLATES.set(template.id, {
    ...template,
    hash,
  });
}
