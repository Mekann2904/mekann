/**
 * @abdd.meta
 * path: .pi/lib/skill-relevance.ts
 * role: スキル関連度スコアリングによる遅延読み込み機能の提供
 * why: プロンプトサイズ削減とトークン効率向上のため、タスクに関連するスキルのみを読み込む
 * related: .pi/extensions/subagents/task-execution.ts, .pi/lib/subagents/application/subagent-service.ts
 * public_api: scoreSkillRelevance, filterRelevantSkills, SKILL_KEYWORDS, type SkillRelevanceScore
 * invariants: スコアは0-1の範囲内、キーワードマッチングは大文字小文字を区別しない
 * side_effects: なし（純粋関数）
 * failure_modes: 空のタスク入力時は全スキルのスコアが0になる
 * @abdd.explain
 * overview: タスク内容を解析し、利用可能なスキルの中から関連度の高いものを特定するライブラリ
 * what_it_does:
 *   - スキルごとに関連キーワードを定義
 *   - タスク内容とキーワードのマッチングに基づいてスコアを計算
 *   - 閾値以上のスキルのみを抽出するフィルタリング機能を提供
 * why_it_exists:
 *   - 全スキルをプロンプトに含めるとトークン消費が増大するため
 *   - タスクに関連するスキルのみを選択的に読み込むため
 * scope:
 *   in: タスク文字列、スキルIDリスト、設定（閾値など）
 *   out: スキルごとのスコア、フィルタリングされたスキルリスト
 */

/**
 * スキルの関連度スコアリング結果
 * @summary 関連度スコアリング結果
 */
export interface SkillRelevanceScore {
  /** スキルID */
  skillId: string;
  /** 関連度スコア（0-1） */
  score: number;
  /** スコアの理由 */
  reason: string;
  /** マッチしたキーワード */
  matchedKeywords: string[];
}

/**
 * スキル関連度設定
 * @summary 関連度設定
 */
export interface SkillRelevanceConfig {
  /** 高関連の閾値（全文読み込み） */
  highRelevanceThreshold: number;
  /** 中関連の閾値（要約のみ） */
  mediumRelevanceThreshold: number;
  /** キーワードマッチの重み */
  keywordWeight: number;
  /** コンテキストマッチの重み */
  contextWeight: number;
}

/**
 * デフォルトのスキル関連度設定
 */
export const DEFAULT_SKILL_RELEVANCE_CONFIG: SkillRelevanceConfig = {
  highRelevanceThreshold: 0.5,
  mediumRelevanceThreshold: 0.2,
  keywordWeight: 0.7,
  contextWeight: 0.3,
};

/**
 * スキルIDと関連キーワードのマッピング
 * タスク内容と照合して関連度を判定するために使用
 */
export const SKILL_KEYWORDS: Record<string, string[]> = {
  // 開発ワークフロー
  "git-workflow": [
    "commit", "branch", "merge", "push", "pull", "git",
    "コミット", "ブランチ", "マージ", "プッシュ", "コンフリクト",
    "バージョン管理", "リポジトリ", "checkout", "rebase",
  ],
  "code-review": [
    "review", "レビュー", "品質", "quality", "inspection",
    "コードレビュー", "フィードバック", "改善点", "指摘",
  ],
  "clean-architecture": [
    "architect", "設計", "design", "refactor", "リファクタ",
    "アーキテクチャ", "クリーン", "凝集", "結合", "coupling", "cohesion",
  ],

  // テスト・品質
  "test-engineering": [
    "test", "テスト", "spec", "スペック", "unit test",
    "integration test", "e2e", "テストケース", "カバレッジ",
    "jest", "vitest", "pytest", "assertion",
  ],
  "bug-hunting": [
    "bug", "バグ", "error", "fix", "修正", "デバッグ",
    "debug", "クラッシュ", "例外", "exception", "不具合",
  ],
  "invariant-generation": [
    "invariant", "インバリアント", "property", "プロパティ",
    "model-based", "mbt", "fast-check", "quint", "tla",
    "形式仕様", "仕様検証", "contract",
  ],

  // 検索・探索
  "search-tools": [
    "search", "find", "検索", "探", "grep", "ripgrep",
    "locate", "ファイル検索", "コード検索", "シンボル",
  ],
  "repograph-localization": [
    "localize", "ローカライズ", "依存", "dependency",
    "コード位置", "関連ファイル", "impact", "影響範囲",
  ],

  // エージェント・自己改善
  "self-improvement": [
    "improve", "改善", "optimize", "最適化", "performance",
    "自己改善", "iteration", "反復", "学習",
  ],
  "self-reflection": [
    "reflect", "振り返り", "review", "評価", "assessment",
    "自己評価", "retrospective", "ふりかえり",
  ],
  "dynamic-tools": [
    "tool", "ツール", "generate", "生成", "dynamic",
    "動的", "create tool", "custom tool",
  ],
  "agent-estimation": [
    "estimate", "見積", "工数", "effort", "time",
    "所要時間", "コスト", "リソース",
  ],

  // 特殊タスク
  "inquiry-exploration": [
    "inquiry", "問い", "探求", "explore", "investigate",
    "調査", "分析", "深掘り", "why", "なぜ",
  ],
  "logical-analysis": [
    "logic", "論理", "argument", "論証", "validity",
    "妥当性", "演繹", "帰納", "推論", "reasoning",
  ],
  "harness-engineering": [
    "harness", "ハーネス", "quality", "品質", "reliability",
    "信頼性", "verification", "検証", "golden",
  ],
  "dyntaskmas": [
    "parallel", "並列", "concurrent", "分配", "schedule",
    "スケジュール", "タスク割当", "ワークフロー",
  ],
  "task-planner": [
    "plan", "計画", "schedule", "分解", "decompose",
    "タスク分割", "ダグ", "dag", "依存関係",
  ],
  "alma-memory": [
    "memory", "メモリ", "remember", "記憶", "learn",
    "学習", "experience", "経験", "pattern",
  ],
  "abdd": [
    "abdd", "実態", "意図", "乖離", "divergence",
    "ドキュメント", "spec", "仕様", "philosophy",
  ],
  "playwright-cli": [
    "browser", "ブラウザ", "web", "ウェブ", "page",
    "ページ", "screenshot", "スクリーンショット", "navigate",
    "form", "フォーム", "click", "入力",
  ],
  "reasoning-bonds": [
    "reasoning", "推論", "bond", "分子", "reflection",
    "自己反思", "exploration", "探索", "cot",
  ],
};

/**
 * コンテキストベースの関連度ブースト
 * 特定のコンテキストが含まれている場合に特定スキルのスコアを上げる
 */
const CONTEXT_BOOSTS: Record<string, { skills: string[]; boost: number }> = {
  "ul mode": { skills: ["task-planner", "self-reflection"], boost: 0.3 },
  "research phase": { skills: ["search-tools", "repograph-localization"], boost: 0.3 },
  "implement phase": { skills: ["git-workflow", "test-engineering"], boost: 0.2 },
  "review phase": { skills: ["code-review", "clean-architecture"], boost: 0.3 },
  "bug fix": { skills: ["bug-hunting", "search-tools"], boost: 0.3 },
  "refactor": { skills: ["clean-architecture", "test-engineering"], boost: 0.3 },
};

/**
 * スキルの関連度をスコアリング
 * @summary スキル関連度スコアリング
 * @param task タスク内容
 * @param availableSkills 利用可能なスキルIDリスト
 * @param config 設定（オプション）
 * @returns スキルごとの関連度スコア
 */
export function scoreSkillRelevance(
  task: string,
  availableSkills: string[],
  config: SkillRelevanceConfig = DEFAULT_SKILL_RELEVANCE_CONFIG,
): SkillRelevanceScore[] {
  const taskLower = task.toLowerCase();
  const results: SkillRelevanceScore[] = [];

  for (const skillId of availableSkills) {
    const keywords = SKILL_KEYWORDS[skillId] || [];
    const matchedKeywords: string[] = [];
    let matchCount = 0;

    // キーワードマッチング
    for (const keyword of keywords) {
      if (taskLower.includes(keyword.toLowerCase())) {
        matchCount += 1;
        matchedKeywords.push(keyword);
      }
    }

    // ベーススコア計算
    const keywordScore = keywords.length > 0
      ? Math.min(1, matchCount / Math.max(1, keywords.length * 0.2))
      : 0;

    // コンテキストブースト適用
    let contextBoost = 0;
    for (const [context, boostConfig] of Object.entries(CONTEXT_BOOSTS)) {
      if (taskLower.includes(context) && boostConfig.skills.includes(skillId)) {
        contextBoost = Math.max(contextBoost, boostConfig.boost);
      }
    }

    // 最終スコア
    const score = Math.min(1, keywordScore * config.keywordWeight + contextBoost * config.contextWeight);

    // 理由の構築
    let reason: string;
    if (score >= config.highRelevanceThreshold) {
      reason = `high relevance: ${matchCount} keywords matched (${matchedKeywords.slice(0, 3).join(", ")})`;
    } else if (score >= config.mediumRelevanceThreshold) {
      reason = `medium relevance: ${matchCount} keywords matched`;
    } else if (score > 0) {
      reason = `low relevance: ${matchCount} keywords matched`;
    } else {
      reason = "no keywords matched";
    }

    if (contextBoost > 0) {
      reason += ` + context boost`;
    }

    results.push({
      skillId,
      score,
      reason,
      matchedKeywords,
    });
  }

  // スコア順にソート
  return results.sort((a, b) => b.score - a.score);
}

/**
 * 関連度に基づいてスキルをフィルタリング
 * @summary スキルフィルタリング
 * @param task タスク内容
 * @param availableSkills 利用可能なスキルIDリスト
 * @param config 設定（オプション）
 * @returns フィルタリング結果
 */
export function filterRelevantSkills(
  task: string,
  availableSkills: string[],
  config: SkillRelevanceConfig = DEFAULT_SKILL_RELEVANCE_CONFIG,
): {
  /** 高関連スキル（全文読み込み推奨） */
  highRelevance: string[];
  /** 中関連スキル（要約のみ推奨） */
  mediumRelevance: string[];
  /** 低関連スキル（名前のみ参照） */
  lowRelevance: string[];
  /** 全スコア */
  scores: SkillRelevanceScore[];
} {
  const scores = scoreSkillRelevance(task, availableSkills, config);

  const highRelevance = scores
    .filter((s) => s.score >= config.highRelevanceThreshold)
    .map((s) => s.skillId);

  const mediumRelevance = scores
    .filter((s) => s.score >= config.mediumRelevanceThreshold && s.score < config.highRelevanceThreshold)
    .map((s) => s.skillId);

  const lowRelevance = scores
    .filter((s) => s.score < config.mediumRelevanceThreshold)
    .map((s) => s.skillId);

  return {
    highRelevance,
    mediumRelevance,
    lowRelevance,
    scores,
  };
}

/**
 * スキル読み込み戦略を決定
 * @summary 読み込み戦略決定
 * @param score 関連度スコア
 * @param config 設定
 * @returns 読み込み戦略
 */
export function getSkillLoadStrategy(
  score: number,
  config: SkillRelevanceConfig = DEFAULT_SKILL_RELEVANCE_CONFIG,
): "full" | "summary" | "name-only" {
  if (score >= config.highRelevanceThreshold) {
    return "full";
  }
  if (score >= config.mediumRelevanceThreshold) {
    return "summary";
  }
  return "name-only";
}
