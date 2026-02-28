/**
 * @abdd.meta
 * path: .pi/lib/self-improvement/adapters/prompts.ts
 * role: プロンプト生成のアダプター
 * why: クリーンアーキテクチャのInterface Adapters層として、LLM用プロンプトの生成を集約するため
 * related: ../domain/types.ts, ../domain/perspective.ts
 * public_api: buildLoopMarker, parseLoopCycleMarker, buildULPhaseMarker, parseULPhaseMarker, buildAutonomousCyclePrompt, buildPerspectivePrompt, buildResearchPrompt, buildPlanPrompt, buildImplementPrompt
 * invariants: マーカーは一意のフォーマットを持つ
 * side_effects: なし
 * failure_modes: パース時のフォーマット不一致
 * @abdd.explain
 * overview: LLM用プロンプト生成関数
 * what_it_does:
 *   - ループマーカーの生成・パース
 *   - サイクル用プロンプトの生成
 *   - ULフェーズ用プロンプトの生成
 * why_it_exists:
 *   - プロンプト生成ロジックを一箇所に集約し、保守性を高めるため
 * scope:
 *   in: ../domain/types.ts, ../domain/perspective.ts
 *   out: application層
 */

import type {
  PerspectiveName,
  PerspectiveState,
  PerspectiveResult,
  ActiveAutonomousRun,
  ULPhase,
  MetacognitiveCheck,
  ImprovementAction,
} from "../domain/types.js";
import { PERSPECTIVES } from "../domain/perspective.js";

// ============================================================================
// マーカー生成・パース
// ============================================================================

const LOOP_MARKER_PREFIX = "[[SELF_IMPROVEMENT_LOOP";
const UL_PHASE_MARKER_PREFIX = "[[UL_PHASE";

/**
 * ループマーカーを生成する
 * @summary ループマーカーを生成
 * @param runId 実行ID
 * @param cycle サイクル番号
 * @returns マーカー文字列
 */
export function buildLoopMarker(runId: string, cycle: number): string {
  return `${LOOP_MARKER_PREFIX}:${runId}:CYCLE:${cycle}]]`;
}

/**
 * ループマーカーをパースする
 * @summary ループマーカーをパース
 * @param text テキスト
 * @returns パース結果またはnull
 */
export function parseLoopCycleMarker(text: string): { runId: string; cycle: number } | null {
  const match = text.match(/\[\[SELF_IMPROVEMENT_LOOP:([a-zA-Z0-9_-]+):CYCLE:(\d+)\]\]/);
  if (!match) return null;
  const cycle = Number.parseInt(match[2]!, 10);
  if (!Number.isFinite(cycle) || cycle < 1) return null;
  return { runId: match[1]!, cycle };
}

/**
 * ULフェーズマーカーを生成する
 * @summary ULフェーズマーカーを生成
 * @param runId 実行ID
 * @param phase フェーズ名
 * @param cycle サイクル番号
 * @returns ULフェーズマーカー文字列
 */
export function buildULPhaseMarker(runId: string, phase: ULPhase, cycle: number): string {
  return `${UL_PHASE_MARKER_PREFIX}:${runId}:${phase}:CYCLE:${cycle}]]`;
}

/**
 * ULフェーズマーカーをパースする
 * @summary ULフェーズマーカーをパース
 * @param text テキスト
 * @returns パース結果またはnull
 */
export function parseULPhaseMarker(text: string): { runId: string; phase: string; cycle: number } | null {
  const match = text.match(/\[\[UL_PHASE:([a-zA-Z0-9_-]+):([a-z_]+):CYCLE:(\d+)\]\]/);
  if (!match) return null;
  const cycle = Number.parseInt(match[3]!, 10);
  if (!Number.isFinite(cycle) || cycle < 1) return null;
  return {
    runId: match[1]!,
    phase: match[2]!,
    cycle,
  };
}

// ============================================================================
// サイクル用プロンプト
// ============================================================================

/**
 * 自律サイクル用のプロンプトを生成する
 * @summary 自律サイクルプロンプトを生成
 * @param run 現在のラン状態
 * @param cycle サイクル番号
 * @returns プロンプト文字列
 */
export function buildAutonomousCyclePrompt(run: ActiveAutonomousRun, cycle: number): string {
  const marker = buildLoopMarker(run.runId, cycle);
  
  // 前回のサイクルからの学び
  const previousSummary = run.cycleSummaries.length > 0 
    ? `\n## Previous Progress\n${run.cycleSummaries.slice(-3).join('\n')}\n`
    : '';

  // 戦略セクション
  let strategySection = '';
  if (run.perspectiveScoreHistory.length > 0) {
    const latest = run.perspectiveScoreHistory[run.perspectiveScoreHistory.length - 1];
    if (latest && latest.average < 70) {
      strategySection = `\n## Strategic Guidance\nCurrent average score is low (${latest.average}%). Focus on deeper analysis.\n`;
    }
  }

  // 品質ガイダンス
  let qualityGuidance = '';
  if (run.lastMetacognitiveCheck) {
    const mc = run.lastMetacognitiveCheck;
    const depthScore = (run.lastInferenceDepthScore ?? 0.5) * 100;
    
    const qualityTargets: string[] = [];
    
    if (mc.deconstruction.binaryOppositions.length > 0) {
      qualityTargets.push(`Deconstruct binary oppositions: Explore third alternatives beyond "A or B"`);
    }
    if (mc.logic.fallacies.length > 0) {
      qualityTargets.push(`Logical rigor: Avoid logical leaps and verify each reasoning step`);
    }
    if (mc.philosophyOfThought.metacognitionLevel < 0.5) {
      qualityTargets.push(`Metacognition: Explicitly state premises and reasoning processes`);
    }
    
    if (qualityTargets.length > 0) {
      qualityGuidance = `\n## Quality Targets (Previous Depth: ${depthScore.toFixed(0)}%)

${qualityTargets.map((t, i) => `${i + 1}. ${t}`).join('\n')}
`;
    }
  }

  return `${marker}

Act as a standard coding agent. Continue executing the following task:
${run.task}
${previousSummary}${strategySection}${qualityGuidance}
## Thinking Framework

### Seed Questions for Exploration
- What is the "essence" of this problem? (not symptoms)
- Why couldn't conventional approaches solve it?
- What am I assuming is "impossible"?
- What if we think in reverse?

### Guidance for Deep Thinking
1. **Understand**: Restate the problem in your own words
2. **Explore**: Consider multiple approaches
3. **Verify**: Seek counter-evidence for your choices
4. **Integrate**: Make judgments based on the findings

## Output Format

\`\`\`
## Question
[The question to explore in this cycle]

## Exploration
[Multiple approaches or perspectives]

## Execution
[Selected approach and rationale]

## Reflection
[What was learned, what was overlooked]
\`\`\`

## Execution Rules
- Use tools freely
- Reflect changes in files and run tests
- Seek evidence that contradicts your hypothesis

## Required Output Format

At the end of your output, include:
\`\`\`
CYCLE: ${cycle}
LOOP_STATUS: continue
NEXT_FOCUS: 1-3 line summary of next priority
PERSPECTIVE_SCORES:
  deconstruction: [0-100]
  schizoanalysis: [0-100]
  eudaimonia: [0-100]
  utopia_dystopia: [0-100]
  thinking_philosophy: [0-100]
  thinking_taxonomy: [0-100]
  logic: [0-100]
\`\`\`
`;
}

// ============================================================================
// 視座用プロンプト
// ============================================================================

/**
 * 視座分析用のプロンプトを生成する
 * @summary 視座プロンプトを生成
 * @param perspective 視座状態
 * @param task タスク内容
 * @param previousResults 前回の視座結果
 * @param previousMetacognitiveCheck 前回のメタ認知チェック
 * @returns プロンプト文字列
 */
export function buildPerspectivePrompt(
  perspective: PerspectiveState, 
  task: string, 
  previousResults: PerspectiveResult[],
  previousMetacognitiveCheck?: MetacognitiveCheck
): string {
  const perspectiveInfo = PERSPECTIVES.find((p) => p.name === perspective.name);
  const previousContext = previousResults.length > 0
    ? `\n\n## Continuation from Previous Perspectives\n${previousResults.map((r) => {
        const p = PERSPECTIVES.find((pp) => pp.name === r.perspective);
        return `- ${p?.displayName ?? r.perspective}: ${r.findings.slice(0, 2).join(", ")}`;
      }).join("\n")}`
    : "";

  // メタ認知チェックに基づく動的プロンプト強化
  let depthRequirements = "";
  if (previousMetacognitiveCheck) {
    const mc = previousMetacognitiveCheck;
    
    if (mc.logic.fallacies.length > 0) {
      depthRequirements += `\n\n## Previously Detected Logical Fallacies
Avoid these fallacies detected in previous analysis:
${mc.logic.fallacies.map(f => `- ${f.type}: ${f.description}`).join("\n")}
**Countermeasure**: Explicitly state the logical relationship between premises and conclusions.`;
    }
    
    if (mc.deconstruction.aporias.length > 0) {
      depthRequirements += `\n\n## Detected Aporias (Unresolvable Tensions)
Maintain the tension between poles rather than rushing to resolve:
${mc.deconstruction.aporias.map(a => `- ${a.description}`).join("\n")}`;
    }
    
    if (mc.philosophyOfThought.metacognitionLevel < 0.5) {
      depthRequirements += `\n\n## Metacognition Enhancement Required
- Explicitly state your premises
- Describe your reasoning process
- Actively consider alternatives`;
    }
  }

  return `# ${perspectiveInfo?.displayName ?? perspective.name} - Self-Analysis Prompt

## Current Task
${task}

## Role of This Perspective
${perspectiveInfo?.description ?? perspective.description}${previousContext}${depthRequirements}

## Analysis Instructions

Output in the following format:

\`\`\`
FINDINGS:
- [Finding 1]
- [Finding 2]
...

QUESTIONS:
- [Question to ask yourself 1]
- [Question to ask yourself 2]
...

IMPROVEMENTS:
- [Specific improvement action 1]
- [Specific improvement action 2]
...

SCORE: [0-100]

SUMMARY: [1-2 sentence summary]
\`\`\`

## Required Depth Checks

Perform at least one of these checks and include results in FINDINGS or QUESTIONS:

1. **Counter-example search**: Look for cases or evidence that could disprove your claim
2. **Boundary conditions**: Consider conditions or extreme cases where the claim doesn't hold
3. **Premise articulation**: Explicitly state implicit premises
4. **Alternative interpretations**: Consider other interpretations from the same evidence

## Notes
- Avoid vague expressions ("handle appropriately", "as needed")
- Propose specific and actionable improvements
- Seek at least one piece of evidence that contradicts your hypothesis
- Verify there are no logical leaps in each reasoning step
`;
}

// ============================================================================
// ULモード用プロンプト
// ============================================================================

/**
 * タスクに基づいて研究の焦点を選択する
 * @summary 研究焦点を選択
 * @param task タスク記述
 * @returns 焦点（視座名と問い）
 */
function selectResearchFocus(task: string): { perspective: string; question: string } {
  const taskLower = task.toLowerCase();
  
  if (taskLower.includes('バグ') || taskLower.includes('bug') || taskLower.includes('fix') || taskLower.includes('修正')) {
    return {
      perspective: 'Logical Verification',
      question: 'Where is the logic broken?'
    };
  }
  
  if (taskLower.includes('リファクタ') || taskLower.includes('refactor') || taskLower.includes('整理')) {
    return {
      perspective: 'Critical Code Analysis',
      question: 'What assumptions are being made?'
    };
  }
  
  if (taskLower.includes('機能') || taskLower.includes('feature') || taskLower.includes('追加') || taskLower.includes('add')) {
    return {
      perspective: 'Feature Analysis',
      question: 'What does this feature produce and what does it exclude?'
    };
  }
  
  if (taskLower.includes('パフォーマンス') || taskLower.includes('performance') || taskLower.includes('高速') || taskLower.includes('最適化')) {
    return {
      perspective: 'Evaluation Criteria',
      question: 'What is the "good state"?'
    };
  }
  
  if (taskLower.includes('アーキテクチャ') || taskLower.includes('architecture') || taskLower.includes('設計') || taskLower.includes('構造')) {
    return {
      perspective: 'Future Prediction',
      question: 'How will this change affect the future?'
    };
  }
  
  if (taskLower.includes('テスト') || taskLower.includes('test') || taskLower.includes('検証')) {
    return {
      perspective: 'Logic Verification',
      question: 'What inputs will break it?'
    };
  }
  
  return {
    perspective: 'Current State Recognition',
    question: 'What is the problem and what should be changed?'
  };
}

/**
 * Research フェーズ用のプロンプトを生成する
 * @summary Researchフェーズプロンプトを生成
 * @param run 現在のラン状態
 * @returns Researchフェーズ用プロンプト
 */
export function buildResearchPrompt(run: ActiveAutonomousRun): string {
  const marker = buildULPhaseMarker(run.runId, 'research', run.cycle);
  
  const focus = selectResearchFocus(run.task);
  
  const previousContext = run.cycleSummaries.length > 0 
    ? `\n### Previous Progress\n${run.cycleSummaries.slice(-1).join('\n')}\n` 
    : '';

  return `${marker}

## Research

### Task
${run.task}${previousContext}

### Focus
**${focus.perspective}**: ${focus.question}

### Output
Current State: [1-2 paragraphs describing the current state related to the task]
Next Action: [What should be done in the Plan phase]

RESEARCH_COMPLETE: true
`;
}

/**
 * Plan フェーズ用のプロンプトを生成する
 * @summary Planフェーズプロンプトを生成
 * @param run 現在のラン状態
 * @returns Planフェーズ用プロンプト
 */
export function buildPlanPrompt(run: ActiveAutonomousRun): string {
  const marker = buildULPhaseMarker(run.runId, 'plan', run.cycle);
  
  const researchContext = run.phaseContext.researchOutput 
    ? `\n### Research Findings\n${run.phaseContext.researchOutput}\n`
    : '';

  return `${marker}

## Plan

### Task
${run.task}${researchContext}

### Output
Goal: [What should be achieved in this cycle]
Steps: [Numbered list of steps to execute]
Success Criteria: [How to determine success]

PLAN_COMPLETE: true
`;
}

/**
 * Implement フェーズ用のプロンプトを生成する
 * @summary Implementフェーズプロンプトを生成
 * @param run 現在のラン状態
 * @returns Implementフェーズ用プロンプト
 */
export function buildImplementPrompt(run: ActiveAutonomousRun): string {
  const marker = buildULPhaseMarker(run.runId, 'implement', run.cycle);
  
  const planContext = run.phaseContext.planOutput
    ? `\n### Plan Content\n${run.phaseContext.planOutput}\n`
    : '';

  return `${marker}

## Implement

### Task
${run.task}${planContext}

### Output
Execution: [What was changed]
Test Results: [Test execution results]
Reflection: [What was learned]

CYCLE: ${run.cycle}
LOOP_STATUS: continue

PERSPECTIVE_SCORES:
  overall: [0-100]
`;
}
