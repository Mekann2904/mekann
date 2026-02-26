/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-pipeline.ts
 * role: Development pipeline integration for self-improvement
 * why: Automate analysis at key development checkpoints
 * related: self-improvement-loop.ts, self-improvement-dev-analyzer.ts
 * public_api: runPreCommitAnalysis, runPostCommitAnalysis, generateReviewAnalysis
 * invariants: Must not block commits (advisory only)
 * side_effects: Writes analysis results to .pi/analyses/
 * failure_modes: Git not available, analysis timeout
 * @abdd.explain
 * overview: Integrates philosophical perspective analysis into development workflow checkpoints
 * what_it_does:
 *   - Pre-commit analysis: Detects high-risk patterns before commit
 *   - Post-commit analysis: Generates quality reports after commit
 *   - Review analysis: Creates PR review summaries
 * why_it_exists: Automates continuous quality improvement without blocking development
 * scope:
 *   in: Git staged files, commit hash, base branch
 *   out: Analysis reports in JSON/Markdown format
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  DEV_PERSPECTIVE_TRANSLATIONS,
  analyzeCodeFromPerspective,
  type PerspectiveName,
  type CodeContext,
} from "./self-improvement-dev-analyzer.js";

/**
 * Pre-commit分析結果
 * @summary Result of pre-commit analysis
 */
export interface PreCommitAnalysisResult {
  /** タイムスタンプ */
  timestamp: string;
  /** 分析対象ファイル */
  files: string[];
  /** リスクレベル */
  riskLevel: "low" | "medium" | "high";
  /** 視座別の警告と提案 */
  perspectives: {
    perspective: string;
    warnings: string[];
    suggestions: string[];
  }[];
  /** コミットをブロックするか（常にfalse: advisory only） */
  shouldBlock: boolean;
}

/**
 * Post-commit分析結果
 * @summary Result of post-commit analysis
 */
export interface PostCommitAnalysisResult {
  /** コミットハッシュ */
  commitHash: string;
  /** コミットメッセージ */
  commitMessage: string;
  /** タイムスタンプ */
  timestamp: string;
  /** 分析結果 */
  analyses: Array<{
    perspective: PerspectiveName;
    analysis: string;
    refactoringSuggestions: string[];
    testRecommendations: string[];
  }>;
}

/**
 * 高リスクパターンの定義
 * @summary High-risk code pattern definition
 */
interface HighRiskPattern {
  /** 検出パターン（正規表現） */
  pattern: RegExp;
  /** リスク識別子 */
  risk: string;
  /** 関連する視座 */
  perspective: PerspectiveName;
}

/**
 * 高リスクパターン検出定義
 *
 * Pre-commitフックで検出する危険なコードパターンを定義する。
 * 各パターンは関連する哲学的視座にマッピングされる。
 *
 * @summary High-risk code patterns for pre-commit detection
 */
const HIGH_RISK_PATTERNS: HighRiskPattern[] = [
  {
    pattern: /delete\s+/g,
    risk: "destructive_operation",
    perspective: "logic",
  },
  {
    pattern: /DROP\s+TABLE/gi,
    risk: "database_destruction",
    perspective: "utopia_dystopia",
  },
  {
    pattern: /password|secret|token/gi,
    risk: "sensitive_data",
    perspective: "schizoanalysis",
  },
  {
    pattern: /any\s+as\s+/g,
    risk: "type_unsafety",
    perspective: "deconstruction",
  },
  {
    pattern: /TODO|FIXME|HACK/gi,
    risk: "tech_debt",
    perspective: "eudaimonia",
  },
  {
    pattern: /eval\s*\(/g,
    risk: "code_injection",
    perspective: "logic",
  },
  {
    pattern: /innerHTML\s*=/g,
    risk: "xss_vulnerability",
    perspective: "schizoanalysis",
  },
];

/**
 * リスク緩和策のマッピング
 * @summary Risk mitigation strategies
 */
const RISK_MITIGATIONS: Record<string, string[]> = {
  destructive_operation: ["削除前にバックアップを確認", "論理削除の検討", "削除確認ダイアログの追加"],
  database_destruction: [
    "マイグレーションロールバックを準備",
    "本番DBでの実行を確認",
    "DROP文を別のマイグレーションに分離",
  ],
  sensitive_data: ["環境変数の使用を検討", "シークレット管理サービスの利用", "ログ出力の確認"],
  type_unsafety: ["型ガードの追加", "より安全な型アサーション", "unknown型の使用"],
  tech_debt: ["Issueの作成", "見積もりの記録", "優先度の設定"],
  code_injection: ["入力の検証", "サニタイゼーション", "安全な代替APIの使用"],
  xss_vulnerability: ["textContentの使用", "DOMPurify等のサニタイザー", "エスケープ処理"],
};

/**
 * Gitコマンドを安全に実行する
 *
 * @summary Executes git command safely
 * @param args - Gitコマンドの引数
 * @param cwd - 作業ディレクトリ
 * @returns コマンドの出力
 */
function runGitCommand(args: string[], cwd: string = process.cwd()): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      encoding: "utf-8",
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return "";
  }
}

/**
 * 分析結果の保存ディレクトリを確保する
 *
 * @summary Ensures analysis directory exists
 * @returns 分析ディレクトリのパス
 */
function ensureAnalysisDir(): string {
  const analysisDir = join(process.cwd(), ".pi", "analyses");
  if (!existsSync(analysisDir)) {
    mkdirSync(analysisDir, { recursive: true });
  }
  return analysisDir;
}

/**
 * Pre-commit分析を実行する
 *
 * ステージングされたファイルを分析し、高リスクパターンを検出する。
 * 結果は `.pi/analyses/` ディレクトリにJSON形式で保存される。
 *
 * **重要**: この分析は「advisory only」であり、コミットをブロックしない。
 *
 * @summary Runs pre-commit analysis on staged files
 * @returns Pre-commit分析結果
 *
 * @example
 * ```typescript
 * const result = await runPreCommitAnalysis();
 * if (result.perspectives.length > 0) {
 *   console.log("Warnings detected:", result.perspectives);
 * }
 * ```
 */
export async function runPreCommitAnalysis(): Promise<PreCommitAnalysisResult> {
  const timestamp = new Date().toISOString();

  // ステージングされたファイルを取得
  const stagedFilesRaw = runGitCommand(["diff", "--cached", "--name-only"]);
  const stagedFiles = stagedFilesRaw
    .trim()
    .split("\n")
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx"));

  if (stagedFiles.length === 0) {
    return {
      timestamp,
      files: [],
      riskLevel: "low",
      perspectives: [],
      shouldBlock: false,
    };
  }

  const perspectives: PreCommitAnalysisResult["perspectives"] = [];
  let riskLevel: "low" | "medium" | "high" = "low";

  // 各ファイルを分析
  for (const file of stagedFiles) {
    const content = runGitCommand(["show", `:${file}`]);

    if (!content) continue;

    // 高リスクパターンを検出
    for (const { pattern, risk, perspective } of HIGH_RISK_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        // リスクレベルを更新
        if (riskLevel === "low") {
          riskLevel = "medium";
        }
        if (matches.length >= 3 && riskLevel === "medium") {
          riskLevel = "high";
        }

        // 既存の視座エントリを探す
        const existing = perspectives.find((p) => p.perspective === perspective);
        const warning = `${file}: ${risk} detected (${matches.length} occurrences)`;
        const mitigations = RISK_MITIGATIONS[risk] || [];

        if (existing) {
          existing.warnings.push(warning);
          for (const m of mitigations) {
            if (!existing.suggestions.includes(m)) {
              existing.suggestions.push(m);
            }
          }
        } else {
          perspectives.push({
            perspective,
            warnings: [warning],
            suggestions: [...mitigations],
          });
        }
      }
    }
  }

  const result: PreCommitAnalysisResult = {
    timestamp,
    files: stagedFiles,
    riskLevel,
    perspectives,
    shouldBlock: false, // Advisory only - never block commits
  };

  // 結果を保存
  const analysisDir = ensureAnalysisDir();
  const filename = `pre-commit-${Date.now()}.json`;
  writeFileSync(join(analysisDir, filename), JSON.stringify(result, null, 2));

  return result;
}

/**
 * Post-commit分析を実行する
 *
 * 指定されたコミットの変更を7つの視座から分析し、
 * 品質レポートを生成する。
 *
 * @summary Runs post-commit code quality analysis
 * @param commitHash - 分析対象のコミットハッシュ
 * @returns Post-commit分析結果
 *
 * @example
 * ```typescript
 * const result = await runPostCommitAnalysis("abc1234");
 * console.log(`Found ${result.analyses.length} perspective analyses`);
 * ```
 */
export async function runPostCommitAnalysis(commitHash: string): Promise<PostCommitAnalysisResult> {
  const timestamp = new Date().toISOString();

  // コミットメッセージを取得
  const commitMessage = runGitCommand(["log", "-1", "--format=%B", commitHash]).trim();

  // 変更されたファイルを取得
  const changedFilesRaw = runGitCommand(["diff-tree", "--no-commit-id", "--name-only", "-r", commitHash]);
  const changedFiles = changedFilesRaw
    .trim()
    .split("\n")
    .filter((f) => f && (f.endsWith(".ts") || f.endsWith(".tsx")));

  // 各視座から分析を実行
  const analyses: PostCommitAnalysisResult["analyses"] = [];

  for (const file of changedFiles) {
    // 差分を取得
    const diff = runGitCommand(["show", `${commitHash}`, "--", file]);

    for (const perspective of Object.keys(DEV_PERSPECTIVE_TRANSLATIONS) as PerspectiveName[]) {
      const analysis = analyzeCodeFromPerspective(perspective, {
        filePath: file,
        codeSnippet: diff,
        changeType: "modify",
        relatedFiles: [],
      });

      analyses.push({
        perspective: analysis.perspective,
        analysis: analysis.analysis,
        refactoringSuggestions: analysis.refactoringSuggestions,
        testRecommendations: analysis.testRecommendations,
      });
    }
  }

  const result: PostCommitAnalysisResult = {
    commitHash,
    commitMessage,
    timestamp,
    analyses,
  };

  // 結果を保存
  const analysisDir = ensureAnalysisDir();
  const filename = `post-commit-${commitHash}.json`;
  writeFileSync(join(analysisDir, filename), JSON.stringify(result, null, 2));

  return result;
}

/**
 * PRレビュー用分析を生成する
 *
 * 現在のブランチとベースブランチの差分を分析し、
 * レビュー用のMarkdownレポートを生成する。
 *
 * @summary Generates PR review analysis
 * @param baseBranch - ベースブランチ名（デフォルト: "main"）
 * @returns レビュー分析のMarkdownレポート
 *
 * @example
 * ```typescript
 * const reviewMd = await generateReviewAnalysis("main");
 * console.log(reviewMd);
 * ```
 */
export async function generateReviewAnalysis(baseBranch: string = "main"): Promise<string> {
  // 差分を取得
  const diff = runGitCommand(["diff", `${baseBranch}...HEAD`]);
  const changedFiles = runGitCommand(["diff", `${baseBranch}...HEAD`, "--name-only"])
    .trim()
    .split("\n")
    .filter((f) => f);

  // 変更統計を取得
  const stats = runGitCommand(["diff", `${baseBranch}...HEAD`, "--stat"]);

  // 各視座の分析セクションを生成
  const perspectiveSections: string[] = [];

  for (const [perspective, translation] of Object.entries(DEV_PERSPECTIVE_TRANSLATIONS)) {
    const section = `## ${translation.devName}

**視座**: ${perspective}

### 分析プロンプト
${translation.codeAnalysisPrompts.map((p) => `- ${p}`).join("\n")}

### 検出ポイント
- [${translation.devName}の観点から分析が必要]

`;
    perspectiveSections.push(section);
  }

  const report = `# Self-Improvement Review Analysis

## 変更サマリー

\`\`\`
${stats || "（変更なし）"}
\`\`\`

## 変更ファイル

${changedFiles.map((f) => `- \`${f}\``).join("\n")}

---

${perspectiveSections.join("\n---\n\n")}

## 推奨アクション

- [ ] ロジック検証: エッジケースと不変条件の確認
- [ ] 前提の暴露: 隠れた依存関係の特定
- [ ] DX評価: 保守性と認知負荷の確認
- [ ] 将来リスク: 技術的負債の予測
- [ ] テスト追加: カバレッジギャップの埋め合わせ

---

*Generated by self-improvement-pipeline at ${new Date().toISOString()}*
`;

  return report;
}

/**
 * 高リスクパターンの一覧を取得する（デバッグ用）
 *
 * @summary Gets list of high-risk patterns
 * @returns 高リスクパターンの配列
 */
export function getHighRiskPatterns(): Array<{ risk: string; perspective: string }> {
  return HIGH_RISK_PATTERNS.map(({ risk, perspective }) => ({ risk, perspective }));
}

export default (_api: ExtensionAPI) => {
  // This extension exports utility functions for other extensions
  // No tools or commands to register
  console.log("[self-improvement-pipeline] Extension loaded successfully");
};
