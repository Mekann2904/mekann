/**
 * @abdd.meta
 * path: .pi/lib/mediator-history.ts
 * role: 確認済み事実の永続化管理
 * why: メモリディレクトリ上のJSONファイルへの読み書き、タイムスタンプ更新、ディレクトリ作成を担当するため
 * related: .pi/lib/mediator-types.ts, .pi/lib/storage-lock.ts
 * public_api: loadConfirmedFacts, saveConfirmedFacts, appendFact, HISTORY_FILES
 * invariants: 保存時にlastUpdatedAtは現在時刻に更新される、キーが重複する事実は上書きされる
 * side_effects: ディレクトリが存在しない場合は作成する、ファイルシステムへの書き込みを行う
 * failure_modes: JSONパース失敗、ファイル書き込み権限エラー、ディレクトリ作成失敗時にデフォルト値またはエラー返却
 * @abdd.explain
 * overview: 確認済み事実(ConfirmedFactsStore)をファイルシステムに保存・復元するモジュール
 * what_it_does:
 *   - confirmed-facts.jsonからのストアデータの読み込みとバリデーション
 *   - ストアデータのJSONシリアライズとファイル書き込み
 *   - 新規事実の追加および既存事実の更新
 * why_it_exists:
 *   - アプリケーション再起動後にユーザーの設定や確認済み事実を保持するため
 *   - ファイルアクセス時の排他制理やエラーハンドリングを共通化するため
 * scope:
 *   in: メモリディレクトリパス、確認済み事実ストア、追加対象の事実データ
 *   out: 確認済み事実ストア、書き込み成功可否の真偽値
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type SessionId,
  type Timestamp,
  type ConfirmedFact,
  type ConfirmedFactsStore,
  type UserPreferences,
  getCurrentTimestamp,
  generateSessionId,
} from "./mediator-types.js";
import { withFileLock, atomicWriteTextFile } from "./storage/storage-lock.js";

// ============================================================================
// 定数
// ============================================================================

/**
 * 履歴ファイル名
 */
export const HISTORY_FILES = {
  confirmedFacts: "confirmed-facts.json",
  conversationSummary: "conversation-summary.md",
} as const;

/**
 * デフォルトの確認済み事実ストア
 */
const DEFAULT_FACTS_STORE: ConfirmedFactsStore = {
  facts: [],
  userPreferences: {},
  lastUpdatedAt: getCurrentTimestamp(),
};

// ============================================================================
// 確認済み事実の管理
// ============================================================================

/**
 * 確認済み事実をロード
 * @summary confirmed-facts.jsonから読み込み
 * @param memoryDir メモリディレクトリパス
 * @returns 確認済み事実ストア
 */
export function loadConfirmedFacts(memoryDir: string): ConfirmedFactsStore {
  const filePath = join(memoryDir, HISTORY_FILES.confirmedFacts);
  
  if (!existsSync(filePath)) {
    return { ...DEFAULT_FACTS_STORE };
  }
  
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    
    // バリデーション
    if (!isValidFactsStore(parsed)) {
      console.warn("[mediator-history] Invalid facts store format, using default");
      return { ...DEFAULT_FACTS_STORE };
    }
    
    return parsed as ConfirmedFactsStore;
  } catch (error) {
    console.warn("[mediator-history] Failed to load confirmed facts:", error);
    return { ...DEFAULT_FACTS_STORE };
  }
}

/**
 * 確認済み事実を保存
 * @summary confirmed-facts.jsonへ書き込み
 * @param memoryDir メモリディレクトリパス
 * @param store 確認済み事実ストア
 * @returns 保存成功可否
 */
export function saveConfirmedFacts(
  memoryDir: string,
  store: ConfirmedFactsStore
): boolean {
  const filePath = join(memoryDir, HISTORY_FILES.confirmedFacts);
  
  // ディレクトリ作成
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }
  
  // タイムスタンプ更新
  store.lastUpdatedAt = getCurrentTimestamp();
  
  try {
    const content = JSON.stringify(store, null, 2);
    atomicWriteTextFile(filePath, content);
    return true;
  } catch (error) {
    console.error("[mediator-history] Failed to save confirmed facts:", error);
    return false;
  }
}

/**
 * 確認済み事実を追加
 * @summary 新しい事実を追加して保存
 * @param memoryDir メモリディレクトリパス
 * @param fact 追加する事実
 * @returns 追加成功可否
 */
export function appendFact(memoryDir: string, fact: Omit<ConfirmedFact, "id" | "confirmedAt">): boolean {
  const store = loadConfirmedFacts(memoryDir);
  
  // 既存の同じキーの事実を探す
  const existingIndex = store.facts.findIndex(f => f.key === fact.key);
  
  const newFact: ConfirmedFact = {
    ...fact,
    id: generateFactId(),
    confirmedAt: getCurrentTimestamp(),
  };
  
  if (existingIndex >= 0) {
    // 既存を更新
    store.facts[existingIndex] = newFact;
  } else {
    // 新規追加
    store.facts.push(newFact);
  }
  
  return saveConfirmedFacts(memoryDir, store);
}

/**
 * キーで確認済み事実を検索
 * @summary 指定キーの事実を取得
 * @param memoryDir メモリディレクトリパス
 * @param key 事実のキー
 * @returns 見つかった事実、またはundefined
 */
export function findFactByKey(memoryDir: string, key: string): ConfirmedFact | undefined {
  const store = loadConfirmedFacts(memoryDir);
  return store.facts.find(f => f.key === key);
}

/**
 * 最近の確認済み事実を取得
 * @summary 最新N件の事実を取得
 * @param memoryDir メモリディレクトリパス
 * @param limit 取得件数
 * @returns 確認済み事実のリスト
 */
export function getRecentFacts(memoryDir: string, limit: number = 10): ConfirmedFact[] {
  const store = loadConfirmedFacts(memoryDir);
  return store.facts
    .sort((a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime())
    .slice(0, limit);
}

/**
 * セッションIDで事実をフィルタ
 * @summary 特定セッションの事実を取得
 * @param memoryDir メモリディレクトリパス
 * @param sessionId セッションID
 * @returns 該当セッションの事実リスト
 */
export function getFactsBySession(memoryDir: string, sessionId: SessionId): ConfirmedFact[] {
  const store = loadConfirmedFacts(memoryDir);
  return store.facts.filter(f => f.sessionId === sessionId);
}

// ============================================================================
// 会話要約の管理
// ============================================================================

/**
 * 会話要約セクション
 */
interface SummarySection {
  title: string;
  content: string[];
}

/**
 * 会話要約をロード
 * @summary conversation-summary.mdから読み込み
 * @param memoryDir メモリディレクトリパス
 * @returns 会話要約のテキスト
 */
export function loadConversationSummary(memoryDir: string): string {
  const filePath = join(memoryDir, HISTORY_FILES.conversationSummary);
  
  if (!existsSync(filePath)) {
    return "";
  }
  
  try {
    return readFileSync(filePath, "utf-8");
  } catch (error) {
    console.warn("[mediator-history] Failed to load conversation summary:", error);
    return "";
  }
}

/**
 * 会話要約を保存
 * @summary conversation-summary.mdへ書き込み
 * @param memoryDir メモリディレクトリパス
 * @param summary 会話要約テキスト
 * @returns 保存成功可否
 */
export function saveConversationSummary(memoryDir: string, summary: string): boolean {
  const filePath = join(memoryDir, HISTORY_FILES.conversationSummary);
  
  // ディレクトリ作成
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }
  
  try {
    atomicWriteTextFile(filePath, summary);
    return true;
  } catch (error) {
    console.error("[mediator-history] Failed to save conversation summary:", error);
    return false;
  }
}

/**
 * 会話要約に追記
 * @summary 既存の要約に新しいセクションを追加
 * @param memoryDir メモリディレクトリパス
 * @param section 追加するセクション
 * @returns 追記成功可否
 */
export function appendSummarySection(
  memoryDir: string,
  section: SummarySection
): boolean {
  let existing = loadConversationSummary(memoryDir);
  
  // 新しいセクションを作成
  const newSection = formatSummarySection(section);
  
  // 既存の要約に追加（空行で区切る）
  if (existing) {
    existing = existing.trimEnd() + "\n\n" + newSection;
  } else {
    existing = newSection;
  }
  
  return saveConversationSummary(memoryDir, existing);
}

/**
 * セッションの会話要約を生成
 * @summary 特定セッションの要約を生成
 * @param sessionId セッションID
 * @param topic トピック
 * @param decisions 決定事項
 * @param pending 未解決事項
 * @returns フォーマットされた要約セクション
 */
export function createSessionSummary(
  sessionId: SessionId,
  topic: string,
  decisions: string[],
  pending: string[]
): string {
  const timestamp = getCurrentTimestamp();
  
  const lines: string[] = [
    `# Session ${sessionId}`,
    "",
    `**Date**: ${timestamp}`,
    `**Topic**: ${topic}`,
    "",
  ];
  
  if (decisions.length > 0) {
    lines.push("## Decisions");
    decisions.forEach(d => lines.push(`- ${d}`));
    lines.push("");
  }
  
  if (pending.length > 0) {
    lines.push("## Pending");
    pending.forEach(p => lines.push(`- ${p}`));
    lines.push("");
  }
  
  return lines.join("\n");
}

// ============================================================================
// ユーザー設定の管理
// ============================================================================

/**
 * ユーザー設定を取得
 * @summary 保存されているユーザー設定を取得
 * @param memoryDir メモリディレクトリパス
 * @returns ユーザー設定
 */
export function getUserPreferences(memoryDir: string): UserPreferences {
  const store = loadConfirmedFacts(memoryDir);
  return store.userPreferences || {};
}

/**
 * ユーザー設定を更新
 * @summary ユーザー設定を更新して保存
 * @param memoryDir メモリディレクトリパス
 * @param preferences 更新する設定
 * @returns 更新成功可否
 */
export function updateUserPreferences(
  memoryDir: string,
  preferences: Partial<UserPreferences>
): boolean {
  const store = loadConfirmedFacts(memoryDir);
  
  store.userPreferences = {
    ...store.userPreferences,
    ...preferences,
  };
  
  return saveConfirmedFacts(memoryDir, store);
}

// ============================================================================
// 履歴のクリーンアップ
// ============================================================================

/**
 * 古い確認済み事実を削除
 * @summary 指定日数より古い事実を削除
 * @param memoryDir メモリディレクトリパス
 * @param daysToKeep 保持日数
 * @returns 削除された件数
 */
export function pruneOldFacts(memoryDir: string, daysToKeep: number = 30): number {
  const store = loadConfirmedFacts(memoryDir);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const initialCount = store.facts.length;
  store.facts = store.facts.filter(f => {
    const factDate = new Date(f.confirmedAt);
    return factDate >= cutoffDate;
  });
  
  const removedCount = initialCount - store.facts.length;
  
  if (removedCount > 0) {
    saveConfirmedFacts(memoryDir, store);
  }
  
  return removedCount;
}

/**
 * 履歴をエクスポート
 * @summary 全履歴をJSON形式でエクスポート
 * @param memoryDir メモリディレクトリパス
 * @returns エクスポートデータ
 */
export function exportHistory(memoryDir: string): {
  confirmedFacts: ConfirmedFactsStore;
  conversationSummary: string;
  exportedAt: Timestamp;
} {
  return {
    confirmedFacts: loadConfirmedFacts(memoryDir),
    conversationSummary: loadConversationSummary(memoryDir),
    exportedAt: getCurrentTimestamp(),
  };
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * 事実IDを生成
 * @summary 一意の事実IDを生成
 * @returns 事実ID
 */
function generateFactId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `fact-${timestamp}-${random}`;
}

/**
 * 確認済み事実ストアのバリデーション
 * @summary データ形式の妥当性を検証
 * @param data 検証対象データ
 * @returns 有効な場合true
 */
function isValidFactsStore(data: unknown): data is ConfirmedFactsStore {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  
  const store = data as Record<string, unknown>;
  
  // facts配列のチェック
  if (!Array.isArray(store.facts)) {
    return false;
  }
  
  // 各factの基本構造チェック
  for (const fact of store.facts) {
    if (typeof fact !== "object" || fact === null) {
      return false;
    }
    const f = fact as Record<string, unknown>;
    if (typeof f.id !== "string" || typeof f.key !== "string" || typeof f.value !== "string") {
      return false;
    }
  }
  
  return true;
}

/**
 * 要約セクションをフォーマット
 * @summary セクションをMarkdown形式に変換
 * @param section セクションデータ
 * @returns フォーマットされたテキスト
 */
function formatSummarySection(section: SummarySection): string {
  const lines: string[] = [
    `## ${section.title}`,
    "",
  ];
  
  section.content.forEach(line => {
    lines.push(line);
  });
  
  return lines.join("\n");
}

/**
 * 履歴の統計情報を取得
 * @summary 履歴データの統計を計算
 * @param memoryDir メモリディレクトリパス
 * @returns 統計情報
 */
export function getHistoryStats(memoryDir: string): {
  totalFacts: number;
  oldestFact: Timestamp | null;
  newestFact: Timestamp | null;
  hasConversationSummary: boolean;
} {
  const store = loadConfirmedFacts(memoryDir);
  const summary = loadConversationSummary(memoryDir);
  
  let oldestFact: Timestamp | null = null;
  let newestFact: Timestamp | null = null;
  
  if (store.facts.length > 0) {
    const sorted = [...store.facts].sort(
      (a, b) => new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime()
    );
    oldestFact = sorted[0].confirmedAt;
    newestFact = sorted[sorted.length - 1].confirmedAt;
  }
  
  return {
    totalFacts: store.facts.length,
    oldestFact,
    newestFact,
    hasConversationSummary: summary.length > 0,
  };
}
