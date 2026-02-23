/**
 * @abdd.meta
 * path: .pi/lib/dynamic-tools/quality.ts
 * role: ツールの品質スコア算出と実行統計の集計を行うモジュール
 * why: 生成されたツールの信頼性とパフォーマンスを定量化し、改善サイクルを回すため
 * related: .pi/lib/dynamic-tools/types.ts, .pi/lib/dynamic-tools/analyzer.ts
 * public_api: QualityAssessment, CategoryScores, QualityIssue, ExecutionMetrics, ToolUsageStatistics
 * invariants: QualityAssessmentのscoreは0.0から1.0の範囲である、CategoryScoresの各値は0.0から1.0の範囲である
 * side_effects: なし（純粋な型定義）
 * failure_modes: スコア範囲違反、数値型の欠損
 * @abdd.explain
 * overview: ツールの静的品質評価と動的実行メトリクスを管理するためのデータ構造定義
 * what_it_does:
 *   - 品質スコアとカテゴリ別評価（可読性、エラーハンドリング等）を定義する
 *   - 品質課題の重大度と位置情報を保持する
 *   - 実行時間やメモリ使用量などの動的メトリクスを記録する
 *   - ツールの使用統計と成功率、品質トレンドを集計する
 * why_it_exists:
 *   - ツール生成の評価基準を統一するため
 *   - 実行パフォーマンスと品質の相関を分析するため
 * scope:
 *   in: なし
 * out: 品質評価結果、実行メトリクス、使用統計の型定義
 */

/**
 * 品質メトリクス収集モジュール
 * 生成されたツールの品質を評価し、継続的な改善を支援
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 品質評価結果
 * @summary 品質を評価
 */
export interface QualityAssessment {
  /** 品質スコア（0.0-1.0） */
  score: number;
  /** カテゴリ別スコア */
  categoryScores: CategoryScores;
  /** 検出された品質問題 */
  issues: QualityIssue[];
  /** 改善提案 */
  improvements: string[];
  /** 信頼度 */
  confidence: number;
}

/**
 * カテゴリ別スコア
 * @summary スコアを集計
 */
export interface CategoryScores {
  /** コードの可読性 */
  readability: number;
  /** エラーハンドリングの完全性 */
  errorHandling: number;
  /** ドキュメント品質 */
  documentation: number;
  /** テスタビリティ */
  testability: number;
  /** パフォーマンス効率 */
  performance: number;
  /** セキュリティ意識 */
  securityAwareness: number;
}

/**
 * 品質課題
 * @summary 課題を特定
 */
export interface QualityIssue {
  /** カテゴリ */
  category: keyof CategoryScores;
  /** 重大度 */
  severity: "high" | "medium" | "low";
  /** 説明 */
  description: string;
  /** 位置情報 */
  location?: {
    line?: number;
    snippet?: string;
  };
  /** 改善提案 */
  suggestion: string;
}

/**
 * 実行メトリクス
 * @summary メトリクスを記録
 * @returns 改善提案
 */
export interface ExecutionMetrics {
  /** 実行時間（ミリ秒） */
  executionTimeMs: number;
  /** メモリ使用量（バイト） */
  memoryUsedBytes?: number;
  /** 成功フラグ */
  success: boolean;
  /** エラータイプ（失敗時） */
  errorType?: string;
  /** エラーメッセージ（失敗時） */
  errorMessage?: string;
  /** 入力パラメータ */
  inputParameters?: Record<string, unknown>;
  /** 出力サイズ（バイト） */
  outputSizeBytes?: number;
}

/**
 * ツール使用統計
 * @summary 統計を取得
 */
export interface ToolUsageStatistics {
  /** ツールID */
  toolId: string;
  /** 総使用回数 */
  totalUsage: number;
  /** 成功回数 */
  successCount: number;
  /** 失敗回数 */
  failureCount: number;
  /** 平均実行時間（ミリ秒） */
  avgExecutionTimeMs: number;
  /** 最大実行時間（ミリ秒） */
  maxExecutionTimeMs: number;
  /** 最小実行時間（ミリ秒） */
  minExecutionTimeMs: number;
  /** 平均メモリ使用量（バイト） */
  avgMemoryBytes?: number;
  /** 成功率（0.0-1.0） */
  successRate: number;
  /** エラータイプ別発生回数 */
  errorBreakdown: Record<string, number>;
  /** 直近の実行履歴（最大100件） */
  recentExecutions: ExecutionMetrics[];
  /** 品質トレンド（直近N回の平均スコア） */
  qualityTrend: number[];
}

// ============================================================================
// Code Quality Patterns
// ============================================================================

/**
 * 品質パターンの定義
 */
interface QualityPattern {
  pattern: RegExp;
  category: keyof CategoryScores;
  severity: QualityIssue["severity"];
  description: string;
  suggestion: string;
  isPositive: boolean;
}

/**
 * 品質パターンリスト
 */
const QUALITY_PATTERNS: QualityPattern[] = [
  // 可読性 - ネガティブ
  {
    pattern: /^.{121,}/m,
    category: "readability",
    severity: "low",
    description: "長い行（120文字超）が検出されました",
    suggestion: "行を複数行に分割してください",
    isPositive: false,
  },
  {
    pattern: /var\s+\w+/,
    category: "readability",
    severity: "low",
    description: "varキーワードの使用が検出されました",
    suggestion: "constまたはletを使用してください",
    isPositive: false,
  },
  {
    pattern: /==\s*[^=]|[^=]\s*==/,
    category: "readability",
    severity: "low",
    description: "緩い等価比較が検出されました",
    suggestion: "厳密等価（===）を使用してください",
    isPositive: false,
  },
  {
    pattern: /,([^,,\s])/,
    category: "readability",
    severity: "low",
    description: "カンマの後にスペースがない箇所があります",
    suggestion: "カンマの後にスペースを追加してください",
    isPositive: false,
  },

  // 可読性 - ポジティブ
  {
    pattern: /\/\/.*$|\/\*[\s\S]*?\*\//m,
    category: "readability",
    severity: "low",
    description: "コメントが含まれています",
    suggestion: "良い慣習です",
    isPositive: true,
  },
  {
    pattern: /const\s+\w+\s*=/,
    category: "readability",
    severity: "low",
    description: "constの使用",
    suggestion: "良い慣習です",
    isPositive: true,
  },

  // エラーハンドリング - ネガティブ
  {
    pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/,
    category: "errorHandling",
    severity: "high",
    description: "空のcatchブロックが検出されました",
    suggestion: "エラーをログ出力するか、適切に処理してください",
    isPositive: false,
  },
  {
    pattern: /try\s*\{[^}]*\}\s*(?!catch)/,
    category: "errorHandling",
    severity: "medium",
    description: "catchのないtryブロックが検出されました",
    suggestion: "catchブロックを追加してください",
    isPositive: false,
  },
  {
    pattern: /throw\s+new\s+Error\(['"]\s*['"]\)/,
    category: "errorHandling",
    severity: "medium",
    description: "空のエラーメッセージが検出されました",
    suggestion: "説明的なエラーメッセージを追加してください",
    isPositive: false,
  },

  // エラーハンドリング - ポジティブ
  {
    pattern: /try\s*\{[\s\S]*\}\s*catch\s*\([\s\S]*\}\s*finally\s*\{/,
    category: "errorHandling",
    severity: "low",
    description: "finallyブロックが含まれています",
    suggestion: "良い慣習です",
    isPositive: true,
  },
  {
    pattern: /console\.(error|warn)\s*\(/,
    category: "errorHandling",
    severity: "low",
    description: "エラーログ出力が含まれています",
    suggestion: "良い慣習です",
    isPositive: true,
  },

  // ドキュメント - ポジティブ
  {
    pattern: /\/\*\*[\s\S]*?\*\//,
    category: "documentation",
    severity: "low",
    description: "JSDocスタイルのコメントが含まれています",
    suggestion: "良い慣習です",
    isPositive: true,
  },
  {
    pattern: /@param|@returns|@throws/,
    category: "documentation",
    severity: "low",
    description: "JSDocアノテーションが含まれています",
    suggestion: "良い慣習です",
    isPositive: true,
  },

  // テスタビリティ - ネガティブ
  {
    pattern: /Math\.random\s*\(\)|Date\.now\s*\(\)/,
    category: "testability",
    severity: "medium",
    description: "非決定的な値の使用が検出されました",
    suggestion: "依存性注入またはシード可能なランダムを使用してください",
    isPositive: false,
  },
  {
    pattern: /new\s+Date\s*\(\)/,
    category: "testability",
    severity: "low",
    description: "現在時刻への直接参照が検出されました",
    suggestion: "日時をパラメータ化することを検討してください",
    isPositive: false,
  },

  // テスタビリティ - ポジティブ
  {
    pattern: /export\s+(function|const|class|async\s+function)/,
    category: "testability",
    severity: "low",
    description: "関数がエクスポートされています",
    suggestion: "テスト可能性が高いです",
    isPositive: true,
  },

  // パフォーマンス - ネガティブ
  {
    pattern: /\.forEach\s*\([^)]*\)\s*\{[\s\S]{500,}\}/,
    category: "performance",
    severity: "medium",
    description: "非常に大きなforEachブロックが検出されました",
    suggestion: "小さな関数に分割するか、map/reduceの使用を検討してください",
    isPositive: false,
  },
  {
    pattern: /JSON\.parse\s*\(\s*JSON\.stringify/,
    category: "performance",
    severity: "low",
    description: "非効率なディープコピーが検出されました",
    suggestion: "structuredCloneまたは専用のライブラリを使用してください",
    isPositive: false,
  },
  {
    pattern: /(?:const|let|var)?\s*[^;\n]*await\s+[^;]+;\s*(?:const|let|var)?\s*[^;\n]*await\s+[^;]+;\s*(?:const|let|var)?\s*[^;\n]*await\s+[^;]+;/,
    category: "performance",
    severity: "medium",
    description: "逐次的なawaitが検出されました",
    suggestion: "Promise.allの使用を検討してください",
    isPositive: false,
  },

  // パフォーマンス - ポジティブ
  {
    pattern: /Promise\.all\s*\(/,
    category: "performance",
    severity: "low",
    description: "並列処理が使用されています",
    suggestion: "良い慣習です",
    isPositive: true,
  },

  // セキュリティ意識 - ネガティブ
  {
    pattern: /password\s*=\s*['"][^'"]+['"]/i,
    category: "securityAwareness",
    severity: "high",
    description: "ハードコードされたパスワードが検出されました",
    suggestion: "パスワードは環境変数または安全なストレージから取得してください",
    isPositive: false,
  },
  {
    pattern: /innerHTML\s*=/,
    category: "securityAwareness",
    severity: "medium",
    description: "innerHTMLへの代入が検出されました",
    suggestion: "XSS脆弱性のリスクがあります。textContentまたはサニタイズを使用してください",
    isPositive: false,
  },

  // セキュリティ意識 - ポジティブ
  {
    pattern: /sanitize|escape|encode/i,
    category: "securityAwareness",
    severity: "low",
    description: "入力のサニタイズ/エスケープが含まれています",
    suggestion: "良い慣習です",
    isPositive: true,
  },
];

// ============================================================================
// Quality Assessment Functions
// ============================================================================

/**
 * 品質を評価する
 * @summary 品質評価
 * @param {string} code コード文字列
 * @returns {QualityAssessment} 品質評価結果
 */
export function assessCodeQuality(code: string): QualityAssessment {
  const lines = code.split("\n");
  const issues: QualityIssue[] = [];
  const categoryScores: CategoryScores = {
    readability: 0.5,
    errorHandling: 0.5,
    documentation: 0.3,
    testability: 0.5,
    performance: 0.5,
    securityAwareness: 0.5,
  };

  // パターンをチェック
  for (const pattern of QUALITY_PATTERNS) {
    // 正規表現にgフラグがない場合は追加
    const flags = pattern.pattern.flags.includes('g') 
      ? pattern.pattern.flags 
      : pattern.pattern.flags + 'g';
    const matches = Array.from(code.matchAll(new RegExp(pattern.pattern.source, flags)));
    
    for (const match of matches) {
      const lineNum = findLineNumber(lines, match.index ?? 0);
      const snippet = lines[lineNum - 1]?.trim() ?? "";

      if (pattern.isPositive) {
        // ポジティブパターンはスコアを上げる
        categoryScores[pattern.category] = Math.min(1.0, categoryScores[pattern.category] + 0.1);
      } else {
        // ネガティブパターンはスコアを下げ、問題を記録
        const penalty = pattern.severity === "high" ? 0.2 : pattern.severity === "medium" ? 0.1 : 0.05;
        categoryScores[pattern.category] = Math.max(0, categoryScores[pattern.category] - penalty);

        issues.push({
          category: pattern.category,
          severity: pattern.severity,
          description: pattern.description,
          location: {
            line: lineNum,
            snippet,
          },
          suggestion: pattern.suggestion,
        });
      }
    }
  }

  // 追加の品質チェック

  // 関数の長さチェック
  const functionLengths = extractFunctionLengths(code);
  for (const fn of functionLengths) {
    if (fn.length > 50) {
      categoryScores.readability = Math.max(0, categoryScores.readability - 0.1);
      issues.push({
        category: "readability",
        severity: fn.length > 100 ? "high" : "medium",
        description: `長い関数「${fn.name}」が検出されました（${fn.length}行）`,
        location: { line: fn.startLine },
        suggestion: "関数を小さな単位に分割してください",
      });
    }
  }

  // ドキュメントチェック（関数数に対するJSDocの割合）
  const functionCount = functionLengths.length;
  const jsdocCount = (code.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
  if (functionCount > 0 && jsdocCount > 0) {
    categoryScores.documentation = Math.min(1.0, jsdocCount / functionCount);
  }

  // エラーハンドリングチェック
  const hasTry = /try\s*\{/.test(code);
  const hasCatch = /catch\s*\(/.test(code);
  if (hasTry && hasCatch) {
    categoryScores.errorHandling = Math.min(1.0, categoryScores.errorHandling + 0.2);
  }

  // 総合スコアを計算
  const weights = {
    readability: 0.2,
    errorHandling: 0.2,
    documentation: 0.15,
    testability: 0.15,
    performance: 0.15,
    securityAwareness: 0.15,
  };

  let totalScore = 0;
  for (const [category, score] of Object.entries(categoryScores)) {
    totalScore += score * weights[category as keyof CategoryScores];
  }

  // 改善提案を生成
  const improvements = generateImprovements(categoryScores, issues);

  // 信頼度を計算
  const confidence = calculateConfidence(code, issues.length);

  return {
    score: Math.round(totalScore * 100) / 100,
    categoryScores,
    issues,
    improvements,
    confidence,
  };
}

/**
 * 行番号を検索
 */
function findLineNumber(lines: string[], index: number): number {
  let current = 0;
  for (let i = 0; i < lines.length; i++) {
    current += lines[i].length + 1;
    if (current > index) {
      return i + 1;
    }
  }
  return lines.length;
}

/**
 * 関数の長さを抽出
 */
function extractFunctionLengths(code: string): Array<{ name: string; length: number; startLine: number }> {
  const functions: Array<{ name: string; length: number; startLine: number }> = [];
  const lines = code.split("\n");

  // 関数定義パターン
  const functionRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)|async\s+function\s+(\w+))/g;

  let match;
  while ((match = functionRegex.exec(code)) !== null) {
    const name = match[1] || match[2] || match[3] || "anonymous";
    const startIndex = match.index;
    const startLine = findLineNumber(lines, startIndex);

    // 簡易的な関数長さ計算（中括弧の対応）
    let braceCount = 0;
    let started = false;
    let lineCount = 0;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === "{") {
          braceCount++;
          started = true;
        } else if (char === "}") {
          braceCount--;
          if (started && braceCount === 0) {
            functions.push({
              name,
              length: lineCount + 1,
              startLine,
            });
            break;
          }
        }
      }
      if (started) lineCount++;
      if (started && braceCount === 0) break;
    }
  }

  return functions;
}

/**
 * 改善提案を生成
 */
function generateImprovements(
  scores: CategoryScores,
  issues: QualityIssue[]
): string[] {
  const improvements: string[] = [];

  // スコアが低いカテゴリに対する改善提案
  if (scores.documentation < 0.5) {
    improvements.push("JSDocコメントを追加して関数の説明を明確にしてください");
  }
  if (scores.errorHandling < 0.5) {
    improvements.push("エラーハンドリングを強化してください（try-catch、エラーログ）");
  }
  if (scores.testability < 0.5) {
    improvements.push("テストしやすい構造にするため、依存関係をパラメータ化してください");
  }
  if (scores.performance < 0.5) {
    improvements.push("パフォーマンスを改善してください（並列化、メモリ効率）");
  }
  if (scores.securityAwareness < 0.5) {
    improvements.push("セキュリティを強化してください（入力検証、サニタイズ）");
  }

  // 重大な問題に対する提案
  const highSeverityIssues = issues.filter(i => i.severity === "high");
  if (highSeverityIssues.length > 0) {
    improvements.push(`${highSeverityIssues.length}件の重大な品質問題を修正してください`);
  }

  return improvements;
}

/**
 * 信頼度を計算
 */
function calculateConfidence(code: string, issueCount: number): number {
  // コード量が少ないと信頼度は低い
  const lines = code.split("\n").length;
  let confidence = 0.5;

  // コード量による調整
  if (lines >= 10) confidence += 0.1;
  if (lines >= 50) confidence += 0.1;
  if (lines >= 100) confidence += 0.1;

  // 問題数による調整
  if (issueCount === 0) confidence += 0.2;
  else if (issueCount <= 3) confidence += 0.1;
  else if (issueCount > 10) confidence -= 0.1;

  return Math.max(0.3, Math.min(0.95, confidence));
}

// ============================================================================
// Usage Statistics
// ============================================================================

const usageStatistics = new Map<string, ToolUsageStatistics>();

/**
 * メトリクスを記録する
 * @summary メトリクス記録
 * @param {string} toolId ツールID
 * @param {ExecutionMetrics} metrics 実行メトリクス
 * @returns {void} なし
 */
export function recordExecutionMetrics(
  toolId: string,
  metrics: ExecutionMetrics
): void {
  let stats = usageStatistics.get(toolId);
  
  if (!stats) {
    stats = {
      toolId,
      totalUsage: 0,
      successCount: 0,
      failureCount: 0,
      avgExecutionTimeMs: 0,
      maxExecutionTimeMs: 0,
      minExecutionTimeMs: Infinity,
      successRate: 0,
      errorBreakdown: {},
      recentExecutions: [],
      qualityTrend: [],
    };
    usageStatistics.set(toolId, stats);
  }

  // 統計を更新
  stats.totalUsage += 1;
  
  if (metrics.success) {
    stats.successCount += 1;
  } else {
    stats.failureCount += 1;
    if (metrics.errorType) {
      stats.errorBreakdown[metrics.errorType] = (stats.errorBreakdown[metrics.errorType] || 0) + 1;
    }
  }

  // 実行時間の統計
  if (metrics.executionTimeMs > 0) {
    const oldAvg = stats.avgExecutionTimeMs;
    const n = stats.totalUsage;
    stats.avgExecutionTimeMs = (oldAvg * (n - 1) + metrics.executionTimeMs) / n;
    stats.maxExecutionTimeMs = Math.max(stats.maxExecutionTimeMs, metrics.executionTimeMs);
    stats.minExecutionTimeMs = Math.min(stats.minExecutionTimeMs, metrics.executionTimeMs);
  }

  // 成功率
  stats.successRate = stats.successCount / stats.totalUsage;

  // 最近の実行履歴（最大100件）
  stats.recentExecutions.push(metrics);
  if (stats.recentExecutions.length > 100) {
    stats.recentExecutions.shift();
  }
}

/**
 * 統計を取得する
 * @summary 統計取得
 * @param {string} toolId ツールID
 * @returns {ToolUsageStatistics | undefined} 使用統計情報（存在しない場合はundefined）
 */
export function getUsageStatistics(toolId: string): ToolUsageStatistics | undefined {
  return usageStatistics.get(toolId);
}

/**
 * 全統計を取得する
 * @summary 全統計取得
 * @returns {ToolUsageStatistics[]} 全ツールの使用統計情報の配列
 */
export function getAllUsageStatistics(): ToolUsageStatistics[] {
  return Array.from(usageStatistics.values());
}

/**
 * 統計を初期化する
 * @summary 統計リセット
 * @returns {void} なし
 */
export function resetUsageStatistics(): void {
  usageStatistics.clear();
}

/**
 * スコア記録
 * @summary スコアを記録
 * @param {string} toolId ツールID
 * @param {number} score 品質スコア
 * @returns {void} なし
 */
export function recordQualityScore(toolId: string, score: number): void {
  const stats = usageStatistics.get(toolId);
  if (stats) {
    stats.qualityTrend.push(score);
    // 最大20件まで保持
    if (stats.qualityTrend.length > 20) {
      stats.qualityTrend.shift();
    }
  }
}

/**
 * 品質傾向分析
 * @summary 品質傾向を分析
 * @param {string} toolId ツールID
 * @returns {{ trend: "improving" | "declining" | "stable"; avgRecentScore: number; changeRate: number; }} 傾向分析結果
 */
export function analyzeQualityTrend(toolId: string): {
  trend: "improving" | "declining" | "stable";
  avgRecentScore: number;
  changeRate: number;
} {
  const stats = usageStatistics.get(toolId);
  
  if (!stats || stats.qualityTrend.length < 2) {
    return {
      trend: "stable",
      avgRecentScore: 0,
      changeRate: 0,
    };
  }

  const trend = stats.qualityTrend;
  const recentCount = Math.min(5, trend.length);
  const olderCount = trend.length - recentCount;

  const recentAvg = trend.slice(-recentCount).reduce((a, b) => a + b, 0) / recentCount;
  const olderAvg = olderCount > 0
    ? trend.slice(0, olderCount).reduce((a, b) => a + b, 0) / olderCount
    : recentAvg;

  const changeRate = olderAvg > 0 ? (recentAvg - olderAvg) / olderAvg : 0;

  let trendStatus: "improving" | "declining" | "stable" = "stable";
  if (changeRate > 0.1) {
    trendStatus = "improving";
  } else if (changeRate < -0.1) {
    trendStatus = "declining";
  }

  return {
    trend: trendStatus,
    avgRecentScore: recentAvg,
    changeRate,
  };
}
