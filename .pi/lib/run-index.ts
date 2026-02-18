/**
 * @abdd.meta
 * path: .pi/lib/run-index.ts
 * role: 過去の実行履歴を検索可能なインデックスとして構築・管理するモジュール
 * why: 過去の解決策や類似タスクを高速に検索・再利用するため
 * related: fs-utils.js, storage-lock.js, run-history.ts, search-engine.ts
 * public_api: IndexedRun, TaskType, RunIndex, SearchOptions, SearchResult, RUN_INDEX_VERSION
 * invariants: RUN_INDEX_VERSIONは1で固定、keywordIndexとtaskTypeIndexの値は常にrun内のrunIdを参照
 * side_effects: ファイルシステムへの読み書き（インデックスファイルの作成・更新）
 * failure_modes: インデックスファイル不存在時は空のインデックスを返却、ファイル読み込み失敗時は例外送出
 * @abdd.explain
 * overview: サブエージェントとチームの実行履歴から検索インデックスを生成し、キーワード・タスク種別・ステータスによる検索を可能にする
 * what_it_does:
 *   - 実行履歴からIndexedRunレコードを抽出しキーワードとタスク種別を付与
 *   - キーワード逆引きインデックス（keywordIndex）とタスク種別逆引きインデックス（taskTypeIndex）を構築
 *   - ステータス・タスク種別・キーワード一致数によるフィルタリング検索を提供
 * why_it_exists:
 *   - 過去の成功パターンや失敗パターンを効率的に再参照するため
 *   - 類似タスク解決時の意思決定を支援するため
 * scope:
 *   in: 実行履歴データ（subagent/agent-team）、検索クエリ（キーワード、ステータス、タスク種別）
 *   out: RunIndex構造体、SearchResult配列、永続化されたインデックスJSONファイル
 */

/**
 * Run Index Module.
 * Creates searchable indexes from subagent and team run histories.
 * Enables semantic and keyword-based retrieval of past solutions.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir } from "./fs-utils.js";
import { atomicWriteTextFile } from "./storage-lock.js";

// ============================================================================
// Types
// ============================================================================

 /**
  * 抽出されたキーワードとタグを持つインデックス化された実行レコード
  * @param runId 実行ID
  * @param source ソース（"subagent"または"agent-team"）
  * @param agentId エージェントID
  * @param teamId チームID
  * @param task タスク
  * @param summary 要約
  * @param status ステータス（"completed"または"failed"）
  * @param keywords キーワードの配列
  * @param taskType タスクタイプ
  * @param files ファイルの配列
  * @param timestamp タイムスタンプ
  * @param successPattern 成功パターン
  * @param failurePattern 失敗パターン
  */
export interface IndexedRun {
  runId: string;
  source: "subagent" | "agent-team";
  agentId?: string;
  teamId?: string;
  task: string;
  summary: string;
  status: "completed" | "failed";
  keywords: string[];
  taskType: TaskType;
  files: string[];
  timestamp: string;
  successPattern?: string;
  failurePattern?: string;
}

 /**
  * タスクの種類を表す型
  */
export type TaskType =
  | "code-review"
  | "bug-fix"
  | "feature-implementation"
  | "refactoring"
  | "research"
  | "documentation"
  | "testing"
  | "architecture"
  | "analysis"
  | "optimization"
  | "security"
  | "configuration"
  | "unknown";

 /**
  * 実行インデックスの構造。
  * @param version インデックスのバージョン番号
  * @param lastUpdated 最終更新日時
  * @param runs インデックスされた実行のリスト
  * @param keywordIndex キーワードから実行IDへのマッピング
  * @param taskTypeIndex タスクタイプから実行IDへのマッピング
  */
export interface RunIndex {
  version: number;
  lastUpdated: string;
  runs: IndexedRun[];
  keywordIndex: Record<string, string[]>; // keyword -> runIds
  taskTypeIndex: Record<TaskType, string[]>; // taskType -> runIds
}

 /**
  * インデックス検索のオプション
  * @param limit 取得上限数
  * @param status ステータス（"completed" | "failed"）
  * @param taskType タスク種別
  * @param minKeywordMatch 最小キーワード一致数
  */
export interface SearchOptions {
  limit?: number;
  status?: "completed" | "failed";
  taskType?: TaskType;
  minKeywordMatch?: number;
}

 /**
  * 検索結果と関連性スコア
  * @param run インデックス化された実行データ
  * @param score 関連性スコア
  * @param matchedKeywords 一致したキーワードのリスト
  */
export interface SearchResult {
  run: IndexedRun;
  score: number;
  matchedKeywords: string[];
}

// ============================================================================
// Constants
// ============================================================================

export const RUN_INDEX_VERSION = 1;

/**
 * Keywords that indicate specific task types.
 */
const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = {
  "code-review": ["review", "レビュー", "feedback", "品質", "quality", "check"],
  "bug-fix": ["fix", "bug", "error", "修正", "バグ", "エラー", "issue", "resolve"],
  "feature-implementation": ["implement", "add", "create", "実装", "追加", "feature", "機能"],
  refactoring: ["refactor", "リファクタ", "clean", "improve", "改善", "restructure"],
  research: ["research", "investigate", "analyze", "調査", "分析", "study", "explore"],
  documentation: ["document", "doc", "readme", "ドキュメント", "説明"],
  testing: ["test", "テスト", "spec", "verify", "検証"],
  architecture: ["architecture", "design", "アーキテクチャ", "設計", "structure"],
  analysis: ["analyze", "analysis", "解析", "examine", "evaluate"],
  optimization: ["optimize", "performance", "最適化", "speed", "efficient"],
  security: ["security", "vulnerability", "セキュリティ", "脆弱性", "auth"],
  configuration: ["config", "設定", "setup", "configure", "environment"],
  unknown: [],
};

// ============================================================================
// Keyword Extraction
// ============================================================================

 /**
  * テキストからキーワードを抽出します。
  * @param text 入力テキスト
  * @returns キーワードの配列
  */
export function extractKeywords(text: string): string[] {
  const keywords: Set<string> = new Set();

  // Extract words (alphanumeric + Japanese)
  const words = text.match(/[a-zA-Z][a-zA-Z0-9_-]*|[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+/g) || [];

  for (const word of words) {
    const lower = word.toLowerCase();

    // Skip very short words
    if (lower.length < 2) continue;

    // Skip common stop words
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "have", "has", "had", "do", "does", "did", "will", "would",
      "could", "should", "may", "might", "must", "shall", "can",
      "this", "that", "these", "those", "it", "its", "for", "from",
      "with", "about", "into", "through", "during", "before", "after",
      "above", "below", "to", "of", "in", "on", "at", "by", "and", "or",
    ]);

    if (stopWords.has(lower)) continue;

    keywords.add(lower);
  }

  return Array.from(keywords);
}

 /**
  * キーワードに基づいてタスクの種類を分類する
  * @param task - タスク名
  * @param summary - タスクの概要
  * @returns 分類されたタスクの種類
  */
export function classifyTaskType(task: string, summary: string): TaskType {
  const text = `${task} ${summary}`.toLowerCase();
  const scores: Record<TaskType, number> = {} as Record<TaskType, number>;

  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    if (type === "unknown") continue;
    scores[type as TaskType] = keywords.reduce((score, kw) => {
      return score + (text.includes(kw.toLowerCase()) ? 1 : 0);
    }, 0);
  }

  // Find the type with highest score
  let maxScore = 0;
  let maxType: TaskType = "unknown";

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxType = type as TaskType;
    }
  }

  return maxType;
}

 /**
  * テキストからファイルパスを抽出する
  * @param text 処理対象のテキスト
  * @returns 抽出されたファイルパスの配列
  */
export function extractFiles(text: string): string[] {
  const filePatterns = [
    // File paths with extensions (handles commas, semicolons, parens, brackets around/before filenames)
    /(?:^|[\s"'`(\[])([a-zA-Z0-9_\-./]+\.[a-zA-Z]{1,10})(?:[\s"'`,;:)\]]|$)/g,
    // Quoted paths
    /["'`]([^"'`]+\.[a-zA-Z]{1,10})["'`]/g,
  ];

  const files: Set<string> = new Set();

  for (const pattern of filePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const path = match[1];
      // Filter out obvious non-file patterns
      if (path.length > 3 && !path.includes("://") && !path.startsWith("http")) {
        files.add(path);
      }
    }
  }

  return Array.from(files);
}

// ============================================================================
// Index Building
// ============================================================================

 /**
  * サブエージェントの実行記録からインデックスを作成
  * @param run 実行記録
  * @param run.runId 実行ID
  * @param run.agentId エージェントID
  * @param run.task タスク内容
  * @param run.summary 実行の要約
  * @param run.status 実行状態
  * @param run.startedAt 開始日時
  * @param run.finishedAt 終了日時
  * @returns インデックス化された実行データ
  */
export function indexSubagentRun(
  run: {
    runId: string;
    agentId: string;
    task: string;
    summary: string;
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string;
  }
): IndexedRun {
  const text = `${run.task} ${run.summary}`;
  const keywords = extractKeywords(text);
  const taskType = classifyTaskType(run.task, run.summary);
  const files = extractFiles(text);

  return {
    runId: run.runId,
    source: "subagent",
    agentId: run.agentId,
    task: run.task,
    summary: run.summary,
    status: run.status,
    keywords,
    taskType,
    files,
    timestamp: run.startedAt,
  };
}

 /**
  * チーム実行レコードからインデックスを作成
  * @param run - チーム実行データ
  * @returns インデックス化された実行データ
  */
export function indexTeamRun(
  run: {
    runId: string;
    teamId: string;
    task: string;
    summary: string;
    status: "completed" | "failed";
    startedAt: string;
    finishedAt: string;
  }
): IndexedRun {
  const text = `${run.task} ${run.summary}`;
  const keywords = extractKeywords(text);
  const taskType = classifyTaskType(run.task, run.summary);
  const files = extractFiles(text);

  return {
    runId: run.runId,
    source: "agent-team",
    teamId: run.teamId,
    task: run.task,
    summary: run.summary,
    status: run.status,
    keywords,
    taskType,
    files,
    timestamp: run.startedAt,
  };
}

/**
 * Build the complete run index from storage files.
 */
export function buildRunIndex(cwd: string): RunIndex {
  const runs: IndexedRun[] = [];
  const keywordIndex: Record<string, string[]> = {};
  const taskTypeIndex: Record<TaskType, string[]> = {} as Record<TaskType, string[]>;

  // Initialize task type index
  for (const type of Object.keys(TASK_TYPE_KEYWORDS)) {
    taskTypeIndex[type as TaskType] = [];
  }

  // Read subagent runs
  const subagentStoragePath = join(cwd, ".pi", "subagents", "storage.json");
  if (existsSync(subagentStoragePath)) {
    try {
      const content = readFileSync(subagentStoragePath, "utf-8");
      const storage = JSON.parse(content);
      for (const run of storage.runs || []) {
        const indexed = indexSubagentRun(run);
        runs.push(indexed);

        // Update keyword index
        for (const kw of indexed.keywords) {
          if (!keywordIndex[kw]) keywordIndex[kw] = [];
          keywordIndex[kw].push(run.runId);
        }

        // Update task type index
        taskTypeIndex[indexed.taskType].push(run.runId);
      }
    } catch (error) {
      console.error("Error reading subagent storage:", error);
    }
  }

  // Read team runs
  const teamStoragePath = join(cwd, ".pi", "agent-teams", "storage.json");
  if (existsSync(teamStoragePath)) {
    try {
      const content = readFileSync(teamStoragePath, "utf-8");
      const storage = JSON.parse(content);
      for (const run of storage.runs || []) {
        const indexed = indexTeamRun(run);
        runs.push(indexed);

        // Update keyword index
        for (const kw of indexed.keywords) {
          if (!keywordIndex[kw]) keywordIndex[kw] = [];
          keywordIndex[kw].push(run.runId);
        }

        // Update task type index
        taskTypeIndex[indexed.taskType].push(run.runId);
      }
    } catch (error) {
      console.error("Error reading team storage:", error);
    }
  }

  return {
    version: RUN_INDEX_VERSION,
    lastUpdated: new Date().toISOString(),
    runs,
    keywordIndex,
    taskTypeIndex,
  };
}

// ============================================================================
// Index Storage
// ============================================================================

 /**
  * ランインデックスのファイルパスを取得する
  * @param cwd カレントワーキングディレクトリ
  * @returns ランインデックスファイルのパス
  */
export function getRunIndexPath(cwd: string): string {
  return join(cwd, ".pi", "memory", "run-index.json");
}

 /**
  * ディスクから実行インデックスを読み込む
  * @param cwd カレントワーキングディレクトリ
  * @returns 読み込んだ実行インデックス。ファイルが存在しない場合はnull
  */
export function loadRunIndex(cwd: string): RunIndex | null {
  const path = getRunIndexPath(cwd);
  if (!existsSync(path)) return null;

  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

 /**
  * 実行インデックスを保存する
  * @param cwd 作業ディレクトリのパス
  * @param index 保存する実行インデックス
  * @returns なし
  */
export function saveRunIndex(cwd: string, index: RunIndex): void {
  const path = getRunIndexPath(cwd);
  ensureDir(join(cwd, ".pi", "memory"));
  index.lastUpdated = new Date().toISOString();
  atomicWriteTextFile(path, JSON.stringify(index, null, 2));
}

 /**
  * 実行インデックスを取得または構築
  * @param cwd 作業ディレクトリのパス
  * @param maxAgeMs キャッシュの有効期限（ミリ秒）
  * @returns 実行インデックス
  */
export function getOrBuildRunIndex(cwd: string, maxAgeMs: number = 60000): RunIndex {
  const cached = loadRunIndex(cwd);

  if (cached) {
    const age = Date.now() - new Date(cached.lastUpdated).getTime();
    if (age < maxAgeMs) {
      return cached;
    }
  }

  const index = buildRunIndex(cwd);
  saveRunIndex(cwd, index);
  return index;
}

// ============================================================================
// Search Functions
// ============================================================================

 /**
  * クエリに一致する実行を検索します。
  * @param index 検索対象のインデックス
  * @param query 検索クエリ文字列
  * @param options 検索オプション
  * @returns 検索結果の配列
  */
export function searchRuns(
  index: RunIndex,
  query: string,
  options: SearchOptions = {}
): SearchResult[] {
  const { limit = 10, status, taskType, minKeywordMatch = 1 } = options;

  // Extract keywords from query
  const queryKeywords = extractKeywords(query);

  // Score each run
  const results: SearchResult[] = [];

  for (const run of index.runs) {
    // Filter by status if specified
    if (status && run.status !== status) continue;

    // Filter by task type if specified
    if (taskType && run.taskType !== taskType) continue;

    // Calculate keyword match score
    const matchedKeywords = run.keywords.filter((kw) =>
      queryKeywords.some((qk) => qk === kw || kw.includes(qk) || qk.includes(kw))
    );

    if (matchedKeywords.length < minKeywordMatch) continue;

    // Calculate relevance score
    const score = matchedKeywords.length / Math.max(queryKeywords.length, 1);

    results.push({
      run,
      score,
      matchedKeywords,
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  return results.slice(0, limit);
}

 /**
  * タスク説明に基づき類似の過去の実行を検索
  * @param index 検索対象のインデックス
  * @param task タスク説明
  * @param limit 取得上限数
  * @returns 検索結果の配列
  */
export function findSimilarRuns(
  index: RunIndex,
  task: string,
  limit: number = 5
): SearchResult[] {
  return searchRuns(index, task, { limit, status: "completed" });
}

 /**
  * タスクタイプに対応する実行を取得する
  * @param index 実行インデックス
  * @param taskType タスクタイプ
  * @returns 実行の配列
  */
export function getRunsByType(index: RunIndex, taskType: TaskType): IndexedRun[] {
  const runIds = new Set(index.taskTypeIndex[taskType] || []);
  return index.runs.filter((run) => runIds.has(run.runId));
}

 /**
  * 指定したタスクタイプの成功したパターンを取得
  * @param index ランインデックス
  * @param taskType タスクタイプ
  * @param limit 取得件数
  * @returns 成功した実行リスト（新しい順）
  */
export function getSuccessfulPatterns(
  index: RunIndex,
  taskType: TaskType,
  limit: number = 10
): IndexedRun[] {
  const runs = getRunsByType(index, taskType)
    .filter((run) => run.status === "completed")
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return runs.slice(0, limit);
}
