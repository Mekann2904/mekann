/**
 * @abdd.meta
 * path: .pi/lib/file-filter.ts
 * role: タスクに基づくファイル優先度付けとフィルタリング
 * why: 調査タスクでのファイル読み込み効率化とコンテキスト節約
 * related: .pi/lib/parallel-search.ts, .pi/extensions/subagents/task-execution.ts, .pi/skills/search-tools/SKILL.md
 * public_api: prioritizeFiles, filterRelevantFiles, extractTaskKeywords
 * invariants: 返却されるファイルリストは優先度順にソートされる
 * side_effects: なし（純粋関数）
 * failure_modes: キーワード抽出失敗時は空配列を返す
 * @abdd.explain
 * overview: タスク文字列からキーワードを抽出し、ファイルパスとの関連度に基づいて優先度付けを行うモジュール
 * what_it_does:
 *   - タスクから検索キーワードを抽出（日本語・英語対応）
 *   - ファイルパスとキーワードの関連度スコアを計算
 *   - 優先度順にファイルをソートして返却
 *   - コンテキスト予算に基づくファイル数制限
 * why_it_exists:
 *   - 調査タスクで全ファイルを読み込む非効率を回避するため
 *   - AutoCodeRover論文の「文脈局所化」原則を実装するため
 * scope:
 *   in: タスク文字列, ファイルパスリスト, コンテキスト予算（オプション）
 *   out: 優先度付きファイルリスト, キーワード配列
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 優先度付きファイル情報
 * @summary 優先度付きファイル情報
 */
export interface PrioritizedFile {
  /** ファイルパス */
  path: string;
  /** 優先度スコア (0.0-1.0) */
  score: number;
  /** マッチしたキーワード */
  matchedKeywords: string[];
}

/**
 * ファイルフィルタリングオプション
 * @summary ファイルフィルタリングオプション
 */
export interface FileFilterOptions {
  /** 最大ファイル数 */
  maxFiles?: number;
  /** 最小スコア閾値 */
  minScore?: number;
  /** 除外パターン */
  excludePatterns?: string[];
  /** 優先拡張子 */
  priorityExtensions?: string[];
}

// ============================================================================
// Keyword Extraction
// ============================================================================

/**
 * キーワード抽出パターン
 * 日本語・英語の重要語を抽出
 */
const KEYWORD_PATTERNS = {
  // 日本語: 助詞・助動詞を除く実質語
  japanese: /[一-龠々-〇ぁ-んァ-ヶ]+/g,
  // 英語: キャメルケース・スネークケース対応
  english: /[a-zA-Z][a-zA-Z0-9_]*/g,
  // パスっぽい文字列
  path: /[\w/.-]+\/[\w/.-]+/g,
};

/**
 * 除外する一般的な語（ストップワード）
 */
const STOP_WORDS = new Set([
  // 日本語
  "する", "いる", "ある", "なる", "もの", "こと", "ため", "よう",
  "その", "この", "あの", "どの", "それ", "これ", "あれ", "なに",
  "ファイル", "コード", "関数", "クラス", "メソッド", "変数",
  // 英語
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "will", "would",
  "file", "code", "function", "class", "method", "variable",
]);

/**
 * タスクからキーワードを抽出
 * @summary タスクキーワード抽出
 * @param task タスク文字列
 * @returns 抽出されたキーワード配列
 * @description
 *   - 日本語・英語の実質語を抽出
 *   - ストップワードを除外
 *   - 重複を除去
 */
export function extractTaskKeywords(task: string): string[] {
  const keywords: string[] = [];

  // 日本語キーワード抽出
  const japaneseMatches = task.match(KEYWORD_PATTERNS.japanese);
  if (japaneseMatches) {
    keywords.push(...japaneseMatches.filter(w => w.length >= 2 && !STOP_WORDS.has(w)));
  }

  // 英語キーワード抽出
  const englishMatches = task.match(KEYWORD_PATTERNS.english);
  if (englishMatches) {
    keywords.push(...englishMatches.filter(w => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase())));
  }

  // パス抽出
  const pathMatches = task.match(KEYWORD_PATTERNS.path);
  if (pathMatches) {
    keywords.push(...pathMatches);
  }

  // 重複除去と小文字正規化
  const uniqueKeywords = [...new Set(keywords.map(k => k.toLowerCase()))];

  return uniqueKeywords;
}

// ============================================================================
// File Prioritization
// ============================================================================

/**
 * ファイルパスとキーワードの関連度スコアを計算
 * @summary 関連度スコア計算
 * @param filePath ファイルパス
 * @param keywords キーワード配列
 * @returns 関連度スコア (0.0-1.0) とマッチしたキーワード
 */
function calculateRelevanceScore(
  filePath: string,
  keywords: string[]
): { score: number; matchedKeywords: string[] } {
  const normalizedPath = filePath.toLowerCase();
  const matchedKeywords: string[] = [];
  let totalScore = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = keyword.toLowerCase();

    // 完全一致（ファイル名）
    const fileName = normalizedPath.split("/").pop() ?? "";
    if (fileName === normalizedKeyword) {
      totalScore += 1.0;
      matchedKeywords.push(keyword);
      continue;
    }

    // 部分一致（ファイル名）
    if (fileName.includes(normalizedKeyword)) {
      totalScore += 0.8;
      matchedKeywords.push(keyword);
      continue;
    }

    // 部分一致（パス全体）
    if (normalizedPath.includes(normalizedKeyword)) {
      totalScore += 0.5;
      matchedKeywords.push(keyword);
      continue;
    }
  }

  // 正規化: キーワード数で割る（最大1.0）
  const normalizedScore = keywords.length > 0
    ? Math.min(1.0, totalScore / keywords.length)
    : 0;

  return { score: normalizedScore, matchedKeywords };
}

/**
 * ファイルを優先度順にソート
 * @summary ファイル優先度付け
 * @param filePaths ファイルパス配列
 * @param keywords キーワード配列
 * @param options フィルタリングオプション
 * @returns 優先度順のファイルリスト
 * @description
 *   - キーワードとの関連度でスコアリング
 *   - スコア順にソート
 *   - maxFilesで制限
 */
export function prioritizeFiles(
  filePaths: string[],
  keywords: string[],
  options: FileFilterOptions = {}
): PrioritizedFile[] {
  const {
    maxFiles = 20,
    minScore = 0.0,
    excludePatterns = [],
    priorityExtensions = [".ts", ".tsx", ".js", ".jsx", ".md"],
  } = options;

  // 除外パターンの正規表現化
  const excludeRegexes = excludePatterns.map(p => new RegExp(p, "i"));

  // スコア計算とフィルタリング
  const scored: PrioritizedFile[] = filePaths
    .filter(path => !excludeRegexes.some(regex => regex.test(path)))
    .map(path => {
      const { score, matchedKeywords } = calculateRelevanceScore(path, keywords);

      // 拡張子ボーナス
      const ext = path.slice(path.lastIndexOf("."));
      const extensionBonus = priorityExtensions.includes(ext) ? 0.1 : 0;

      return {
        path,
        score: Math.min(1.0, score + extensionBonus),
        matchedKeywords,
      };
    })
    .filter(file => file.score >= minScore);

  // スコア順にソート
  scored.sort((a, b) => b.score - a.score);

  // maxFilesで制限
  return scored.slice(0, maxFiles);
}

/**
 * 関連ファイルのみをフィルタリング
 * @summary 関連ファイル抽出
 * @param task タスク文字列
 * @param filePaths ファイルパス配列
 * @param options フィルタリングオプション
 * @returns 関連度の高いファイルパス配列
 * @description
 *   - タスクからキーワードを自動抽出
 *   - 優先度付けしてパスのみ返却
 */
export function filterRelevantFiles(
  task: string,
  filePaths: string[],
  options: FileFilterOptions = {}
): string[] {
  const keywords = extractTaskKeywords(task);

  if (keywords.length === 0) {
    // キーワードが抽出できない場合は元の順序で制限のみ適用
    return filePaths.slice(0, options.maxFiles ?? 20);
  }

  const prioritized = prioritizeFiles(filePaths, keywords, options);
  return prioritized.map(f => f.path);
}
