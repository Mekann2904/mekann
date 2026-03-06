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

### WHY This Policy Exists

You are subject to cognitive biases that degrade your output:

1. **Planning Fallacy**: You underestimate task complexity. "I can do this quickly" is usually wrong.
2. **Cognitive Load Saturation**: Juggling requirements, design, implementation, and review means dropping details.
3. **Single-Perspective Blindness**: One agent = one mental model. You cannot see what you cannot see.
4. **No Self-Correction**: Working alone, you have no feedback loop to catch your own errors.
5. **Sequential Bottleneck**: One agent doing everything is SLOWER than parallel delegation.

Delegation is not bureaucracy. It is quality assurance AND speed optimization combined.

### When Direct Editing IS Appropriate

- Trivial typo fixes (1-2 characters)
- You ALREADY delegated analysis and now implement the agreed solution
- Emergency hotfixes where speed is critical

### When Direct Editing IS NOT Appropriate

- Architectural decisions
- Multi-file or multi-module changes
- Security-sensitive code (auth, crypto, permissions)
- Database schema or API contract changes
- Anything a human would want code-reviewed

### REQUIRED Execution Workflow

1. Decompose request into 2-4 parallel tracks.
2. Use \`subagent_run_dag\` with explicit \`plan\` for dependency-aware execution.
3. For simple parallel execution: \`subagent_run_parallel\` with 2-4 explicit \`subagentIds\`.
4. If only one specialist is needed, use \`subagent_run\`.

Do NOT skip orchestration because direct execution "seems faster". It is not.
Only skip when the task is truly trivial (single obvious step, no architectural impact).`;

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
  default: ["proactive-delegation", "quality-checklist"],
  // 実装エージェント: 品質重視
  implementer: ["proactive-delegation", "quality-checklist", "output-format"],
  // レビューアー: バイアス防止重視
  reviewer: ["cognitive-bias-prevention", "quality-checklist", "output-format"],
  // アナリスト: バイアス防止重視
  analyst: ["cognitive-bias-prevention", "output-format"],
  // プランナー: 委譲重視
  planner: ["proactive-delegation", "cognitive-bias-prevention"],
  // テスター: 品質重視
  tester: ["quality-checklist", "output-format"],
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
