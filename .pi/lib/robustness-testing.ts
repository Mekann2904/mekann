/**
 * Robustness/Perturbation Testing Module
 * 論文「Large Language Model Reasoning Failures」のP1推奨事項
 * 
 * 機能:
 * 1. 入力摂動テスト（同義語置換、語順変更、ノイズ追加）
 * 2. 境界値テスト（空入力、極端に長い入力、特殊文字）
 * 3. 出力の一貫性テスト（複数回実行での安定性）
 *
 * Related: verification-workflow.ts, output-validation.ts
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * 摂動テストの種類
 */
export type PerturbationType =
  | "synonym-replacement"   // 同義語置換
  | "word-reorder"          // 語順変更
  | "noise-injection"       // ノイズ追加
  | "typo-simulation"       // タイポ模擬
  | "paraphrase";           // 言い換え

/**
 * 境界値テストの種類
 */
export type BoundaryType =
  | "empty-input"           // 空入力
  | "whitespace-only"       // 空白のみ
  | "minimal-input"         // 最小限の入力
  | "extreme-length"        // 極端に長い入力
  | "special-chars"         // 特殊文字
  | "unicode-chars"         // Unicode文字
  | "control-chars";        // 制御文字

/**
 * 摂動テスト結果
 */
export interface PerturbationTestResult {
  type: PerturbationType;
  originalInput: string;
  perturbedInput: string;
  passed: boolean;
  deviation: number;        // 0.0 - 1.0 (出力の差異度)
  notes?: string;
}

/**
 * 境界値テスト結果
 */
export interface BoundaryTestResult {
  type: BoundaryType;
  input: string;
  passed: boolean;
  errorMessage?: string;
  recoveryBehavior?: string;
}

/**
 * 一貫性テスト結果
 */
export interface ConsistencyTestResult {
  runs: number;
  outputs: string[];
  agreementScore: number;   // 0.0 - 1.0
  stablePatterns: string[];
  unstablePatterns: string[];
  passed: boolean;
}

/**
 * 堅牢性テスト全体の結果
 */
export interface RobustnessTestReport {
  perturbationResults: PerturbationTestResult[];
  boundaryResults: BoundaryTestResult[];
  consistencyResults?: ConsistencyTestResult;
  overallScore: number;     // 0.0 - 1.0
  passed: boolean;
  recommendations: string[];
}

/**
 * 堅牢性テスト設定
 */
export interface RobustnessTestConfig {
  enabled: boolean;
  perturbationTypes: PerturbationType[];
  boundaryTypes: BoundaryType[];
  consistencyRuns: number;
  consistencyThreshold: number;
  deviationThreshold: number;
  logResults: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ROBUSTNESS_CONFIG: RobustnessTestConfig = {
  enabled: true,
  perturbationTypes: [
    "synonym-replacement",
    "word-reorder",
    "noise-injection",
    "typo-simulation",
    "paraphrase",
  ],
  boundaryTypes: [
    "empty-input",
    "whitespace-only",
    "minimal-input",
    "extreme-length",
    "special-chars",
    "unicode-chars",
  ],
  consistencyRuns: 3,
  consistencyThreshold: 0.8,
  deviationThreshold: 0.3,
  logResults: process.env.PI_ROBUSTNESS_LOG === "1",
};

// ============================================================================
// Synonym Dictionaries
// ============================================================================

const ENGLISH_SYNONYMS: Record<string, string[]> = {
  "implement": ["create", "build", "develop", "construct"],
  "fix": ["repair", "resolve", "correct", "patch"],
  "error": ["issue", "bug", "problem", "fault"],
  "check": ["verify", "validate", "inspect", "examine"],
  "update": ["modify", "change", "revise", "alter"],
  "delete": ["remove", "erase", "eliminate", "clear"],
  "create": ["generate", "make", "produce", "build"],
  "read": ["load", "fetch", "retrieve", "get"],
  "write": ["save", "store", "record", "persist"],
  "find": ["search", "locate", "discover", "identify"],
  "test": ["verify", "check", "validate", "assess"],
  "analyze": ["examine", "investigate", "study", "review"],
  "optimize": ["improve", "enhance", "refine", "tune"],
  "refactor": ["restructure", "reorganize", "rewrite", "clean"],
};

const JAPANESE_SYNONYMS: Record<string, string[]> = {
  "実装": ["作成", "構築", "開発", "実装する"],
  "修正": ["修復", "解決", "訂正", "変更"],
  "エラー": ["問題", "バグ", "不具合", "エラ"],
  "確認": ["検証", "チェック", "確認する", "調査"],
  "更新": ["変更", "修正", "更新する", "編集"],
  "削除": ["除去", "消去", "削除する", "取り除く"],
  "作成": ["生成", "作る", "構築", "作成する"],
  "読み込み": ["ロード", "取得", "読む", "読込"],
  "書き込み": ["保存", "記録", "書く", "書込"],
  "検索": ["探す", "検索する", "見つける", "調査"],
  "テスト": ["検証", "チェック", "試験", "テストする"],
  "分析": ["調査", "検討", "解析", "分析する"],
  "最適化": ["改善", "調整", "最適化する", "効率化"],
  "リファクタリング": ["整理", "再構築", "リファクタ", "コード改善"],
};

// ============================================================================
// Perturbation Functions
// ============================================================================

/**
 * 同義語置換による摂動
 */
export function applySynonymReplacement(input: string, rate: number = 0.3): string {
  const words = input.split(/(\s+)/);
  let replaced = 0;
  const targetReplacements = Math.ceil(words.length * rate);

  for (let i = 0; i < words.length && replaced < targetReplacements; i++) {
    const word = words[i].toLowerCase().replace(/[.,!?]/g, "");
    
    // Check English synonyms
    if (ENGLISH_SYNONYMS[word]) {
      const synonyms = ENGLISH_SYNONYMS[word];
      words[i] = synonyms[Math.floor(Math.random() * synonyms.length)];
      replaced++;
    }
    
    // Check Japanese synonyms
    for (const [key, synonyms] of Object.entries(JAPANESE_SYNONYMS)) {
      if (words[i].includes(key)) {
        words[i] = words[i].replace(key, synonyms[Math.floor(Math.random() * synonyms.length)]);
        replaced++;
        break;
      }
    }
  }

  return words.join("");
}

/**
 * 語順変更による摂動
 * 文単位で語順を入れ替え（意味の保持を優先）
 */
export function applyWordReorder(input: string): string {
  const sentences = input.split(/([.!?\n]+)/);
  
  for (let i = 0; i < sentences.length; i += 2) {
    const words = sentences[i].split(/\s+/);
    
    // Only reorder if the sentence has 4+ words
    if (words.length >= 4 && !containsJapanese(sentences[i])) {
      // Swap non-adjacent words (preserve some structure)
      const swapIndex = Math.floor(words.length / 2);
      const temp = words[1];
      words[1] = words[swapIndex];
      words[swapIndex] = temp;
      sentences[i] = words.join(" ");
    }
  }

  return sentences.join("");
}

/**
 * ノイズ追加による摂動
 */
export function applyNoiseInjection(input: string, noiseLevel: number = 0.1): string {
  const chars = input.split("");
  const noiseChars = ".,;:-_";
  const insertions = Math.ceil(chars.length * noiseLevel);

  for (let i = 0; i < insertions; i++) {
    const position = Math.floor(Math.random() * chars.length);
    const noiseChar = noiseChars[Math.floor(Math.random() * noiseChars.length)];
    
    // Only insert after spaces or punctuation (preserve word integrity)
    if (position > 0 && /[\s.,!?]/.test(chars[position - 1])) {
      chars.splice(position, 0, noiseChar);
    }
  }

  return chars.join("");
}

/**
 * タイポ模擬による摂動
 */
export function applyTypoSimulation(input: string, typoRate: number = 0.05): string {
  const words = input.split(/(\s+)/);
  const typos = Math.ceil(words.filter(w => /\w/.test(w)).length * typoRate);
  let applied = 0;

  for (let i = 0; i < words.length && applied < typos; i++) {
    if (!/\w/.test(words[i]) || containsJapanese(words[i])) continue;
    
    const word = words[i];
    if (word.length < 4) continue;

    // Apply one of several typo patterns
    const typoType = Math.floor(Math.random() * 4);
    
    switch (typoType) {
      case 0: // Character swap
        const pos = Math.floor(word.length / 2);
        words[i] = word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
        break;
      case 1: // Character omission
        const omitPos = Math.floor(Math.random() * (word.length - 2)) + 1;
        words[i] = word.slice(0, omitPos) + word.slice(omitPos + 1);
        break;
      case 2: // Character duplication
        const dupPos = Math.floor(Math.random() * word.length);
        words[i] = word.slice(0, dupPos) + word[dupPos] + word.slice(dupPos);
        break;
      case 3: // Adjacent key substitution (simplified)
        const adjKeys: Record<string, string> = { "a": "s", "e": "r", "i": "o", "s": "d", "t": "r" };
        for (const [k, v] of Object.entries(adjKeys)) {
          if (word.includes(k)) {
            words[i] = word.replace(k, v);
            break;
          }
        }
        break;
    }
    applied++;
  }

  return words.join("");
}

/**
 * 言い換えによる摂動
 * 文構造を変更しつつ意味を保持
 */
export function applyParaphrase(input: string): string {
  let result = input;

  // English paraphrase patterns
  const enPatterns = [
    { pattern: /please\s+/gi, replacement: "kindly " },
    { pattern: /can you\s+/gi, replacement: "could you " },
    { pattern: /I need to\s+/gi, replacement: "I should " },
    { pattern: /the file\s+/gi, replacement: "this file " },
    { pattern: /fix the\s+/gi, replacement: "resolve the " },
  ];

  // Japanese paraphrase patterns
  const jaPatterns = [
    { pattern: /してください/g, replacement: "お願いします" },
    { pattern: /を修正/g, replacement: "を変更" },
    { pattern: /を確認/g, replacement: "をチェック" },
    { pattern: /してください/g, replacement: "してほしい" },
  ];

  for (const { pattern, replacement } of [...enPatterns, ...jaPatterns]) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

/**
 * 日本語を含むかどうかを判定
 */
function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

// ============================================================================
// Boundary Test Input Generators
// ============================================================================

/**
 * 境界値テスト用入力を生成
 */
export function generateBoundaryInput(type: BoundaryType): string {
  switch (type) {
    case "empty-input":
      return "";
    
    case "whitespace-only":
      return "   \t\n   ";
    
    case "minimal-input":
      return "a";
    
    case "extreme-length":
      // Generate a very long input (100KB)
      return "test ".repeat(20000);
    
    case "special-chars":
      return "!@#$%^&*()_+-=[]{}|;':\",./<>?`~";
    
    case "unicode-chars":
      return "\u4e00\u4e8c\u4e09\u56db\u4e94 \u3042\u3044\u3046\u3048\u304a \u03B1\u03B2\u03B3\u03B4\u03B5";
    
    case "control-chars":
      return "test\x00\x01\x02\x03\x1b\x7ftest";
    
    default:
      return "";
  }
}

// ============================================================================
// Output Comparison Utilities
// ============================================================================

/**
 * 2つの出力間の差異度を計算
 * 0.0 = 同一, 1.0 = 完全に異なる
 */
export function calculateOutputDeviation(output1: string, output2: string): number {
  if (!output1 && !output2) return 0;
  if (!output1 || !output2) return 1;

  // Normalize outputs
  const norm1 = normalizeOutput(output1);
  const norm2 = normalizeOutput(output2);

  // Calculate Jaccard distance on word sets
  const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 0));
  const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 0));

  const intersection = new Set(Array.from(words1).filter(w => words2.has(w)));
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);

  if (union.size === 0) return 0;

  const jaccardSimilarity = intersection.size / union.size;
  return 1 - jaccardSimilarity;
}

/**
 * 出力を正規化（比較用）
 */
function normalizeOutput(output: string): string {
  return output
    .toLowerCase()
    .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 複数出力間の一貫性スコアを計算
 */
export function calculateConsistencyScore(outputs: string[]): number {
  if (outputs.length < 2) return 1;

  let totalDeviation = 0;
  let comparisons = 0;

  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      totalDeviation += calculateOutputDeviation(outputs[i], outputs[j]);
      comparisons++;
    }
  }

  if (comparisons === 0) return 1;
  const avgDeviation = totalDeviation / comparisons;
  return 1 - avgDeviation;
}

/**
 * 安定パターンと不安定パターンを抽出
 */
export function extractStabilityPatterns(outputs: string[]): {
  stablePatterns: string[];
  unstablePatterns: string[];
} {
  if (outputs.length < 2) {
    return { stablePatterns: [], unstablePatterns: [] };
  }

  // Extract structured fields (SUMMARY, CLAIM, RESULT, etc.)
  const fieldPattern = /^(SUMMARY|CLAIM|EVIDENCE|CONFIDENCE|RESULT|NEXT_STEP)\s*:\s*(.+)$/gim;
  const fieldOccurrences: Record<string, Set<string>> = {};

  for (const output of outputs) {
    let match;
    const localPattern = new RegExp(fieldPattern.source, fieldPattern.flags);
    while ((match = localPattern.exec(output)) !== null) {
      const fieldName = match[1];
      const fieldValue = normalizeOutput(match[2]);
      
      if (!fieldOccurrences[fieldName]) {
        fieldOccurrences[fieldName] = new Set();
      }
      fieldOccurrences[fieldName].add(fieldValue);
    }
  }

  const stablePatterns: string[] = [];
  const unstablePatterns: string[] = [];

  for (const [field, values] of Object.entries(fieldOccurrences)) {
    if (values.size === 1) {
      stablePatterns.push(`${field}: ${Array.from(values)[0].slice(0, 50)}...`);
    } else if (values.size > 1) {
      unstablePatterns.push(`${field}: ${values.size} variations`);
    }
  }

  return { stablePatterns, unstablePatterns };
}

// ============================================================================
// Main Test Functions
// ============================================================================

/**
 * 摂動テストを実行
 */
export function runPerturbationTest(
  originalInput: string,
  agentExecutor: (input: string) => Promise<string>,
  config: Partial<RobustnessTestConfig> = {}
): Promise<PerturbationTestResult[]> {
  const fullConfig = { ...DEFAULT_ROBUSTNESS_CONFIG, ...config };
  const results: PerturbationTestResult[] = [];

  const perturbationFunctions: Record<PerturbationType, (input: string) => string> = {
    "synonym-replacement": (i) => applySynonymReplacement(i),
    "word-reorder": (i) => applyWordReorder(i),
    "noise-injection": (i) => applyNoiseInjection(i),
    "typo-simulation": (i) => applyTypoSimulation(i),
    "paraphrase": (i) => applyParaphrase(i),
  };

  const executeTest = async (type: PerturbationType): Promise<PerturbationTestResult> => {
    const perturbFn = perturbationFunctions[type];
    const perturbedInput = perturbFn(originalInput);

    try {
      const originalOutput = await agentExecutor(originalInput);
      const perturbedOutput = await agentExecutor(perturbedInput);
      
      const deviation = calculateOutputDeviation(originalOutput, perturbedOutput);
      const passed = deviation <= fullConfig.deviationThreshold;

      return {
        type,
        originalInput: truncateInput(originalInput),
        perturbedInput: truncateInput(perturbedInput),
        passed,
        deviation,
        notes: passed ? undefined : `High deviation: ${(deviation * 100).toFixed(1)}%`,
      };
    } catch (error) {
      return {
        type,
        originalInput: truncateInput(originalInput),
        perturbedInput: truncateInput(perturbedInput),
        passed: false,
        deviation: 1,
        notes: `Error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  };

  // Note: This returns a Promise but tests run sequentially for stability
  return (async () => {
    for (const type of fullConfig.perturbationTypes) {
      const result = await executeTest(type);
      results.push(result);
      
      if (fullConfig.logResults) {
        console.log(`[Robustness] ${type}: ${result.passed ? "PASS" : "FAIL"} (deviation: ${result.deviation.toFixed(2)})`);
      }
    }
    return results;
  })();
}

/**
 * 境界値テストを実行
 */
export function runBoundaryTest(
  agentExecutor: (input: string) => Promise<string>,
  config: Partial<RobustnessTestConfig> = {}
): Promise<BoundaryTestResult[]> {
  const fullConfig = { ...DEFAULT_ROBUSTNESS_CONFIG, ...config };
  const results: BoundaryTestResult[] = [];

  return (async () => {
    for (const type of fullConfig.boundaryTypes) {
      const input = generateBoundaryInput(type);

      try {
        const output = await agentExecutor(input);
        
        // Check if the output indicates graceful handling
        const hasGracefulHandling = 
          output.length > 0 &&
          !output.toLowerCase().includes("error") &&
          !output.toLowerCase().includes("exception");

        results.push({
          type,
          input: truncateInput(input),
          passed: hasGracefulHandling,
          recoveryBehavior: hasGracefulHandling ? "Graceful degradation" : undefined,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
          type,
          input: truncateInput(input),
          passed: false,
          errorMessage,
          recoveryBehavior: "Exception thrown",
        });
      }

      if (fullConfig.logResults) {
        const lastResult = results[results.length - 1];
        console.log(`[Robustness] ${type}: ${lastResult.passed ? "PASS" : "FAIL"}`);
      }
    }

    return results;
  })();
}

/**
 * 一貫性テストを実行
 */
export function runConsistencyTest(
  input: string,
  agentExecutor: (input: string) => Promise<string>,
  config: Partial<RobustnessTestConfig> = {}
): Promise<ConsistencyTestResult> {
  const fullConfig = { ...DEFAULT_ROBUSTNESS_CONFIG, ...config };
  const outputs: string[] = [];

  return (async () => {
    for (let i = 0; i < fullConfig.consistencyRuns; i++) {
      try {
        const output = await agentExecutor(input);
        outputs.push(output);
      } catch (error) {
        outputs.push(`[ERROR: ${error instanceof Error ? error.message : String(error)}]`);
      }

      if (fullConfig.logResults) {
        console.log(`[Robustness] Consistency run ${i + 1}/${fullConfig.consistencyRuns} completed`);
      }
    }

    const agreementScore = calculateConsistencyScore(outputs);
    const { stablePatterns, unstablePatterns } = extractStabilityPatterns(outputs);
    const passed = agreementScore >= fullConfig.consistencyThreshold;

    return {
      runs: fullConfig.consistencyRuns,
      outputs: outputs.map(o => truncateOutput(o)),
      agreementScore,
      stablePatterns,
      unstablePatterns,
      passed,
    };
  })();
}

/**
 * 包括的な堅牢性テストを実行
 */
export async function runRobustnessTest(
  input: string,
  agentExecutor: (input: string) => Promise<string>,
  config: Partial<RobustnessTestConfig> = {}
): Promise<RobustnessTestReport> {
  const fullConfig = { ...DEFAULT_ROBUSTNESS_CONFIG, ...config };
  
  if (!fullConfig.enabled) {
    return {
      perturbationResults: [],
      boundaryResults: [],
      overallScore: 1,
      passed: true,
      recommendations: ["Robustness testing is disabled"],
    };
  }

  // Run all test categories
  const perturbationResults = await runPerturbationTest(input, agentExecutor, fullConfig);
  const boundaryResults = await runBoundaryTest(agentExecutor, fullConfig);
  const consistencyResults = await runConsistencyTest(input, agentExecutor, fullConfig);

  // Calculate overall score
  const perturbationScore = perturbationResults.filter(r => r.passed).length / Math.max(perturbationResults.length, 1);
  const boundaryScore = boundaryResults.filter(r => r.passed).length / Math.max(boundaryResults.length, 1);
  const consistencyScore = consistencyResults.agreementScore;

  const overallScore = (perturbationScore * 0.4 + boundaryScore * 0.3 + consistencyScore * 0.3);
  const passed = overallScore >= 0.7;

  // Generate recommendations
  const recommendations: string[] = [];

  const failedPerturbations = perturbationResults.filter(r => !r.passed);
  if (failedPerturbations.length > 0) {
    recommendations.push(
      `Consider improving robustness to: ${failedPerturbations.map(r => r.type).join(", ")}`
    );
  }

  const failedBoundaries = boundaryResults.filter(r => !r.passed);
  if (failedBoundaries.length > 0) {
    recommendations.push(
      `Add handling for boundary cases: ${failedBoundaries.map(r => r.type).join(", ")}`
    );
  }

  if (consistencyResults.unstablePatterns.length > 0) {
    recommendations.push(
      `Improve output stability for: ${consistencyResults.unstablePatterns.join(", ")}`
    );
  }

  if (passed && recommendations.length === 0) {
    recommendations.push("System demonstrates good robustness across all test categories");
  }

  return {
    perturbationResults,
    boundaryResults,
    consistencyResults,
    overallScore,
    passed,
    recommendations,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 入力を切り詰め（ログ用）
 */
function truncateInput(input: string, maxLength: number = 100): string {
  if (input.length <= maxLength) return input;
  return input.slice(0, maxLength) + "...";
}

/**
 * 出力を切り詰め（ログ用）
 */
function truncateOutput(output: string, maxLength: number = 200): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "...";
}

/**
 * 堅牢性テスト設定を解決
 */
export function resolveRobustnessConfig(): RobustnessTestConfig {
  const envEnabled = process.env.PI_ROBUSTNESS_TESTING;
  
  if (envEnabled === "disabled" || envEnabled === "0") {
    return { ...DEFAULT_ROBUSTNESS_CONFIG, enabled: false };
  }

  if (envEnabled === "strict") {
    return {
      ...DEFAULT_ROBUSTNESS_CONFIG,
      consistencyRuns: 5,
      consistencyThreshold: 0.9,
      deviationThreshold: 0.2,
    };
  }

  const config = { ...DEFAULT_ROBUSTNESS_CONFIG };

  const threshold = process.env.PI_ROBUSTNESS_THRESHOLD;
  if (threshold) {
    const parsed = parseFloat(threshold);
    if (!isNaN(parsed)) {
      config.deviationThreshold = Math.max(0, Math.min(1, parsed));
    }
  }

  const runs = process.env.PI_ROBUSTNESS_CONSISTENCY_RUNS;
  if (runs) {
    const parsed = parseInt(runs, 10);
    if (!isNaN(parsed)) {
      config.consistencyRuns = Math.max(1, Math.min(10, parsed));
    }
  }

  return config;
}

/**
 * 堅牢性テストレポートをフォーマット
 */
export function formatRobustnessReport(report: RobustnessTestReport): string {
  const lines: string[] = [];
  
  lines.push("[Robustness Test Report]");
  lines.push(`Overall Score: ${(report.overallScore * 100).toFixed(1)}%`);
  lines.push(`Status: ${report.passed ? "PASS" : "FAIL"}`);
  lines.push("");

  if (report.perturbationResults.length > 0) {
    lines.push("Perturbation Tests:");
    for (const result of report.perturbationResults) {
      const status = result.passed ? "PASS" : "FAIL";
      lines.push(`  - ${result.type}: ${status} (deviation: ${(result.deviation * 100).toFixed(1)}%)`);
    }
    lines.push("");
  }

  if (report.boundaryResults.length > 0) {
    lines.push("Boundary Tests:");
    for (const result of report.boundaryResults) {
      const status = result.passed ? "PASS" : "FAIL";
      lines.push(`  - ${result.type}: ${status}`);
      if (result.errorMessage) {
        lines.push(`    Error: ${result.errorMessage}`);
      }
    }
    lines.push("");
  }

  if (report.consistencyResults) {
    lines.push("Consistency Test:");
    lines.push(`  - Agreement Score: ${(report.consistencyResults.agreementScore * 100).toFixed(1)}%`);
    lines.push(`  - Stable Patterns: ${report.consistencyResults.stablePatterns.length}`);
    lines.push(`  - Unstable Patterns: ${report.consistencyResults.unstablePatterns.length}`);
    lines.push("");
  }

  if (report.recommendations.length > 0) {
    lines.push("Recommendations:");
    for (const rec of report.recommendations) {
      lines.push(`  - ${rec}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Integration with Verification Workflow
// ============================================================================

/**
 * 検証ワークフロー用の堅牢性チェックを取得
 */
export function getRobustnessTestRules(): string {
  return `
【堅牢性テスト】

入力の安定性を確保するため、以下のテストを検討:

1. 摂動テスト:
   - 同義語置換: 入力の言い換えに対する安定性
   - 語順変更: 構造変化に対する耐性
   - ノイズ追加: 不要文字混入時の挙動
   - タイポ模擬: 入力ミスに対する許容性

2. 境界値テスト:
   - 空入力: グレースフルな処理
   - 極端に長い入力: メモリ/処理の安全性
   - 特殊文字: エスケープ/サニタイズの確認

3. 一貫性テスト:
   - 複数回実行での結果安定性
   - 確定的な出力パターンの維持

環境変数:
- PI_ROBUSTNESS_TESTING: disabled | auto | strict
- PI_ROBUSTNESS_THRESHOLD: 許容差異閾値 (0.0-1.0)
- PI_ROBUSTNESS_CONSISTENCY_RUNS: 一貫性テスト実行回数
`.trim();
}
