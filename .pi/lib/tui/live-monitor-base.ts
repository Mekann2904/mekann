/**
 * @abdd.meta
 * path: .pi/lib/tui/live-monitor-base.ts
 * role: ライブモニタUIの基底モジュールおよび汎用ユーティリティ定義
 * why: サブエージェントやエージェントチームなど、類似するライブモニタ実装間でのコード重複（DRY違反）を排除するため
 * related: ../format-utils.js, ../live-view-utils.js, ./tui-utils.ts
 * public_api: BaseLiveItem, BaseLiveMonitorController, createBaseLiveItem, appendChunk
 * invariants: BaseLiveItemのidは一意、バイト数と改行数はチャンク追加時に累積される、statusは遷移する
 * side_effects: なし（純粋なデータ型定義とファクトリ/ユーティリティ関数）
 * failure_modes: 不正なステータス遷移、数値オーバーフロー（極端に長い出力時）
 * @abdd.explain
 * overview: ライブ監視ビューに共通するデータ構造、型定義、および基本処理ロジックを提供する基底モジュール
 * what_it_does:
 *   - ライブアイテムの状態や出力ストリームを管理するための型定義（BaseLiveItem, LiveItemStatus等）
 *   - ライブモニタのライフサイクル操作を定義するインターフェース（BaseLiveMonitorController）
 *   - ライブアイテムの生成およびチャンクリッチ（stdout/stderr）の追加処理
 *   - ストリームデータの解析（バイト数、改行数、末尾改行フラグの計算）
 * why_it_exists:
 *   - 複数の種類（サブエージェント、チーム等）のライブビューで共通利用されるロジックを一箇所に集約するため
 *   - UI描画ロジックとデータ管理ロジックを分離し、再利用性を高めるため
 * scope:
 *   in: チャンク文字列、ストリーム種別、アイテムID、ステータス更新情報
 *   out: 更新されたBaseLiveItemインスタンス、フォーマットされた文字列
 */

/**
 * Generic live monitor base module.
 * Provides common patterns for live monitoring views (subagents, agent-teams, etc.).
 * Eliminates DRY violations between similar live monitor implementations.
 */

import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";

import type { Theme } from "./types.js";
import { formatDurationMs, formatBytes, formatClockTime } from "../format-utils.js";
import { computeLiveWindow } from "../agent-utils.js";
import { getLiveStatusGlyph, getLiveStatusColor, getActivityIndicator, isEnterInput, finalizeLiveLines } from "../live-view-utils.js";
import { appendTail, countOccurrences, estimateLineCount, renderPreviewWithMarkdown } from "./tui-utils.js";

// ============================================================================
// Core Types
// ============================================================================

/**
 * ライブアイテムの状態
 * @summary 状態を取得
 */
export type LiveItemStatus = "pending" | "running" | "completed" | "failed";

/**
 * ストリーム出力種別
 * @summary 種別を取得
 */
export type LiveStreamView = "stdout" | "stderr";

/**
 * ライブ表示モード種別
 * @summary モードを取得
 */
export type LiveViewMode = "list" | "detail" | "tree" | "timeline";

/**
 * ライブアイテムの基底データ定義
 * @summary 基底アイテム定義
 */
export interface BaseLiveItem {
  id: string;
  status: LiveItemStatus;
  startedAtMs?: number;
  finishedAtMs?: number;
  lastChunkAtMs?: number;
  summary?: string;
  error?: string;
  stdoutTail: string;
  stderrTail: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutNewlineCount: number;
  stderrNewlineCount: number;
  stdoutEndsWithNewline: boolean;
  stderrEndsWithNewline: boolean;
}

/**
 * ライブモニタの基底コントローラー定義
 * @summary 基底コントローラー定義
 */
export interface BaseLiveMonitorController {
  markStarted: (id: string) => void;
  appendChunk: (id: string, stream: LiveStreamView, chunk: string) => void;
  markFinished: (id: string, status: "completed" | "failed", summary: string, error?: string) => void;
  close: () => void;
  wait: () => Promise<void>;
}

/**
 * ライブアイテム作成用の入力定義
 * @summary アイテム作成入力定義
 */
export interface CreateLiveItemInput {
  id: string;
  name?: string;
}

/**
 * ライブモニタファクトリのオプション定義
 * @summary ファクトリオプション定義
 */
export interface LiveMonitorFactoryOptions<TItem extends BaseLiveItem> {
  createItem: (input: CreateLiveItemInput) => TItem;
  onStarted?: (item: TItem) => void;
  onChunk?: (item: TItem, stream: LiveStreamView, chunk: string) => void;
  onFinished?: (item: TItem, status: "completed" | "failed", summary: string, error?: string) => void;
}

// ============================================================================
// Live Item Factory
// ============================================================================

/**
 * ライブアイテムを生成
 * @summary ライブアイテム生成
 * @param input アイテム生成入力
 * @returns 生成されたライブアイテム
 */
export function createBaseLiveItem(input: CreateLiveItemInput): BaseLiveItem {
  return {
    id: input.id,
    status: "pending",
    stdoutTail: "",
    stderrTail: "",
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutNewlineCount: 0,
    stderrNewlineCount: 0,
    stdoutEndsWithNewline: false,
    stderrEndsWithNewline: false,
  };
}

// ============================================================================
// Stream Utilities
// ============================================================================

/**
 * 適切なストリームにチャンクを追加する
 * @summary チャンク追加処理
 * @param {BaseLiveItem} item 対象のアイテム
 * @param {LiveStreamView} stream 追加先のストリーム
 * @param {string} chunk 追加するチャンク
 * @returns {void}
 */
export function appendStreamChunk(
  item: BaseLiveItem,
  stream: LiveStreamView,
  chunk: string,
): void {
  if (stream === "stdout") {
    item.stdoutTail = appendTail(item.stdoutTail, chunk);
    item.stdoutBytes += Buffer.byteLength(chunk, "utf-8");
    item.stdoutNewlineCount += countOccurrences(chunk, "\n");
    item.stdoutEndsWithNewline = chunk.endsWith("\n");
  } else {
    item.stderrTail = appendTail(item.stderrTail, chunk);
    item.stderrBytes += Buffer.byteLength(chunk, "utf-8");
    item.stderrNewlineCount += countOccurrences(chunk, "\n");
    item.stderrEndsWithNewline = chunk.endsWith("\n");
  }
  item.lastChunkAtMs = Date.now();
}

/**
 * ビューモードとストリームに基づいて末尾を取得
 * @summary ストリーム末尾取得
 * @param {BaseLiveItem} item 対象のアイテム
 * @param {LiveStreamView} stream 対象のストリーム
 * @param {boolean} autoSwitchOnFailure 失敗時に自動切り替えするか
 * @returns {string} 末尾の文字列
 */
export function getStreamTail(
  item: BaseLiveItem,
  stream: LiveStreamView,
  autoSwitchOnFailure: boolean = true,
): string {
  if (
    autoSwitchOnFailure &&
    item.status === "failed" &&
    stream === "stdout" &&
    item.stdoutBytes === 0 &&
    item.stderrBytes > 0
  ) {
    return item.stderrTail;
  }
  return stream === "stdout" ? item.stdoutTail : item.stderrTail;
}

/**
 * バイト数を取得する
 * @summary ストリーム容量取得
 * @param {BaseLiveItem} item 対象のアイテム
 * @param {LiveStreamView} stream 対象のストリーム
 * @returns {number} バイト数
 */
export function getStreamBytes(item: BaseLiveItem, stream: LiveStreamView): number {
  return stream === "stdout" ? item.stdoutBytes : item.stderrBytes;
}

/**
 * 行数を取得する
 * @summary ストリーム行数取得
 * @param {BaseLiveItem} item 対象のアイテム
 * @param {LiveStreamView} stream 対象のストリーム
 * @returns {number} 行数
 */
export function getStreamLineCount(item: BaseLiveItem, stream: LiveStreamView): number {
  return estimateLineCount(
    getStreamBytes(item, stream),
    stream === "stdout" ? item.stdoutNewlineCount : item.stderrNewlineCount,
    stream === "stdout" ? item.stdoutEndsWithNewline : item.stderrEndsWithNewline,
  );
}

// ============================================================================
// Render Utilities
// ============================================================================

/**
 * ヘッダー表示データ
 * @summary ヘッダー情報定義
 * @property {string} title タイトル
 * @property {string} mode モード
 * @property {number} running 実行中数
 * @property {number} completed 完了数
 * @property {number} failed 失敗数
 */
export interface LiveViewHeaderData {
  title: string;
  mode: LiveViewMode;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

/**
 * ヘッダー描画（コンパクト版）
 * @summary ヘッダー描画
 * @param data ヘッダー表示データ
 * @param width 描画幅
 * @param theme テーマ設定
 * @returns 描画されたヘッダー行の配列
 */
export function renderLiveViewHeader(
  data: LiveViewHeaderData,
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  // タイトル行
  add(theme.bold(theme.fg("accent", `${data.title} [${data.mode}]`)));

  // ステータス行（コンパクト）
  const runText = data.running > 0 ? theme.fg("accent", `Run:${data.running}`) : `Run:${data.running}`;
  const doneText = data.completed > 0 ? theme.fg("success", `Done:${data.completed}`) : `Done:${data.completed}`;
  const failText = data.failed > 0 ? theme.fg("error", `Fail:${data.failed}`) : `Fail:${data.failed}`;
  add(`${runText}  ${doneText}  ${failText}`);

  return lines;
}

/**
 * キーボード操作のヒントを描画する（コンパクト版）
 * @summary キーボードヒント描画
 * @param width 表示幅
 * @param theme テーマ設定
 * @returns 描画行の配列
 */
export function renderListKeyboardHints(width: number, theme: Theme): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  add(theme.fg("dim", "[j/k] nav  [g/G] top/bot  [ret] detail  [q] quit"));

  return lines;
}

/**
 * 詳細画面のキーボード操作ヒントを描画する（コンパクト版）
 * @param width 画面幅
 * @param theme テーマ設定
 * @param extraKeys 追加キーのヒント
 * @returns 描画用の文字列配列
 */
export function renderDetailKeyboardHints(
  width: number,
  theme: Theme,
  extraKeys?: string,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  const baseKeys = "[j/k] nav  [tab] stream";
  const endKeys = "[b] back  [q] quit";
  const fullHint = extraKeys
    ? `${baseKeys}  ${extraKeys}  ${endKeys}`
    : `${baseKeys}  ${endKeys}`;

  add(theme.fg("dim", fullHint));

  return lines;
}

/**
 * リストを描画
 * @summary リストを描画
 * @param items - アイテムの配列
 * @param cursor - カーソル位置のインデックス
 * @param windowSize - 表示するウィンドウのサイズ
 * @param renderItem - アイテムを文字列に変換する関数
 * @param width - 表示幅
 * @param theme - テーマ設定オブジェクト
 * @returns 描画された各行の文字列配列
 */
export function renderListWindow<T>(
  items: T[],
  cursor: number,
  windowSize: number,
  renderItem: (item: T, index: number, isSelected: boolean) => string,
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  const range = computeLiveWindow(cursor, items.length, windowSize);

  if (range.start > 0) {
    add(theme.fg("dim", `... ${range.start} above ...`));
  }

  for (let index = range.start; index < range.end; index += 1) {
    const item = items[index];
    const isSelected = index === cursor;
    add(renderItem(item, index, isSelected));
  }

  if (range.end < items.length) {
    add(theme.fg("dim", `... ${items.length - range.end} below ...`));
  }

  return lines;
}

/**
 * 単一のリストアイテム行を描画する（コンパクト版）
 * @param item リストアイテム
 * @param index インデックス
 * @param isSelected 選択状態かどうか
 * @param width 幅
 * @param theme テーマ
 * @param extraMeta 追加メタ情報
 * @returns 描画された文字列
 */
export function renderBaseListItemLine(
  item: BaseLiveItem & { name?: string },
  index: number,
  isSelected: boolean,
  width: number,
  theme: Theme,
  extraMeta?: string,
): string {
  const prefix = isSelected ? ">" : " ";
  const glyph = getLiveStatusGlyph(item.status);
  const glyphColor = getLiveStatusColor(item.status);
  const displayName = item.name || item.id;
  const elapsed = formatDurationMs(item);

  // アクティビティ判定
  const hasOutput = item.stdoutBytes > 0;
  const hasError = item.stderrBytes > 0;
  const isRecent = item.lastChunkAtMs ? (Date.now() - item.lastChunkAtMs) < 2000 : false;
  const activity = getActivityIndicator(hasOutput, hasError, isRecent);

  // 色付きグリフ
  const coloredGlyph = theme.fg(glyphColor, glyph);
  const base = `${prefix} ${coloredGlyph} ${displayName}`;

  // コンパクトなメタ情報: 経過時間 + アクティビティ + バイト数（エラー時のみ）
  const metaParts = [elapsed, activity];
  if (hasError) {
    metaParts.push(`err:${formatBytes(item.stderrBytes)}`);
  } else if (hasOutput) {
    metaParts.push(formatBytes(item.stdoutBytes));
  }
  if (extraMeta) metaParts.push(extraMeta);

  const meta = metaParts.join(" ");

  return `${isSelected ? theme.fg("accent", base) : base} ${theme.fg("dim", meta)}`;
}

/**
 * 選択中アイテムの概要を描画する
 * @summary 選択概要描画
 * @param items アイテム配列
 * @param cursor 選択位置のインデックス
 * @param getItemId ID取得関数
 * @param getItemName 名前取得関数
 * @param getItemStatus ステータス取得関数
 * @param getItemElapsed 経過時間取得関数
 * @param width 幅
 * @param theme テーマ設定
 * @param extraInfo 追加情報取得関数
 * @returns 描画結果の文字列配列
 */
export function renderSelectedItemSummary<T>(
  items: T[],
  cursor: number,
  getItemId: (item: T) => string,
  getItemName: (item: T) => string | undefined,
  getItemStatus: (item: T) => LiveItemStatus,
  getItemElapsed: (item: T) => string,
  width: number,
  theme: Theme,
  extraInfo?: (item: T) => string | undefined,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  const selected = items[cursor];
  if (!selected) return lines;

  const id = getItemId(selected);
  const name = getItemName(selected);
  const status = getItemStatus(selected);
  const elapsed = getItemElapsed(selected);
  const extra = extraInfo?.(selected);

  const baseInfo = `selected ${cursor + 1}/${items.length}: ${id}${name ? ` (${name})` : ""} | status:${status} | elapsed:${elapsed}`;
  const fullInfo = extra ? `${baseInfo} | ${extra}` : baseInfo;

  add(theme.fg("dim", fullInfo));

  return lines;
}

/**
 * 選択アイテムの詳細ヘッダーを描画する
 * @summary 詳細ヘッダー描画
 * @param item 対象アイテム
 * @param cursor 選択位置のインデックス
 * @param total 全体の件数
 * @param getItemId ID取得関数
 * @param getItemName 名前取得関数
 * @param width 幅
 * @param theme テーマ設定
 * @returns 描画結果の文字列配列
 */
export function renderDetailHeader<T>(
  item: T,
  cursor: number,
  total: number,
  getItemId: (item: T) => string,
  getItemName: (item: T) => string | undefined,
  width: number,
  theme: Theme,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  const id = getItemId(item);
  const name = getItemName(item);

  add(theme.bold(theme.fg("accent", `selected ${cursor + 1}/${total}: ${id}${name ? ` (${name})` : ""}`)));

  return lines;
}

/**
 * ストリーム出力セクションを描画する
 * @summary ストリーム描画
 * @param item ライブアイテム
 * @param stream ライブストリームビュー
 * @param width 幅
 * @param height 高さ
 * @param currentLines 現在の行数
 * @param theme テーマ設定
 * @param itemId アイテムID
 * @returns 描画結果の文字列配列
 */
export function renderStreamOutput(
  item: BaseLiveItem,
  stream: LiveStreamView,
  width: number,
  height: number,
  currentLines: number,
  theme: Theme,
  itemId: string,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  const previewStream = getStreamTail(item, stream);
  const streamBytes = getStreamBytes(item, stream);
  const streamLines = getStreamLineCount(item, stream);

  add(
    theme.bold(
      theme.fg(
        "accent",
        `[${itemId}] ${stream} tail (last ${LIVE_PREVIEW_LINE_LIMIT} lines | total ${formatBytes(
          streamBytes,
        )}, ${streamLines} lines)`,
      ),
    ),
  );

  const previewLimit =
    height > 0
      ? Math.max(1, Math.min(LIVE_PREVIEW_LINE_LIMIT, height - currentLines - 1))
      : LIVE_PREVIEW_LINE_LIMIT;

  const preview = renderPreviewWithMarkdown(previewStream, width, previewLimit);
  add(theme.fg("dim", `render mode: ${preview.renderedAsMarkdown ? "markdown" : "raw"}`));

  if (preview.lines.length === 0) {
    add(theme.fg("dim", "(no output yet)"));
  } else {
    for (const line of preview.lines) {
      add(line);
    }
  }

  return lines;
}

// ============================================================================
// Input Handling
// ============================================================================

/**
 * 入力処理結果のインターフェース
 * @summary 入力結果定義
 * @param handled 処理されたかどうか
 * @param action 実行するアクション
 * @param cursorDelta カーソルの相対移動量
 * @param cursorAbsolute カーソルの絶対位置
 */
export interface HandleInputResult {
  handled: boolean;
  action?: "close" | "mode-list" | "mode-detail" | "stream-toggle";
  cursorDelta?: number;
  cursorAbsolute?: number;
}

/**
 * リストモード入力を処理
 * @summary リスト入力処理
 * @param rawInput 生の入力文字列
 * @returns 処理結果オブジェクト
 */
export function handleListModeInput(rawInput: string): HandleInputResult {
  if (matchesKey(rawInput, "q") || matchesKey(rawInput, Key.escape)) {
    return { handled: true, action: "close" };
  }

  if (rawInput === "j" || matchesKey(rawInput, Key.down)) {
    return { handled: true, cursorDelta: 1 };
  }

  if (rawInput === "k" || matchesKey(rawInput, Key.up)) {
    return { handled: true, cursorDelta: -1 };
  }

  if (rawInput === "g") {
    return { handled: true, cursorAbsolute: 0 };
  }

  if (rawInput === "G") {
    return { handled: true, cursorAbsolute: -1 }; // -1 means last
  }

  if (isEnterInput(rawInput)) {
    return { handled: true, action: "mode-detail" };
  }

  if (rawInput === "\t" || rawInput === "tab") {
    return { handled: true, action: "stream-toggle" };
  }

  return { handled: false };
}

/**
 * @summary 詳細入力処理
 * @description 詳細モード時の入力を解析します。
 * @param rawInput 生の入力文字列
 * @returns 処理結果
 */
export function handleDetailModeInput(rawInput: string): HandleInputResult {
  if (matchesKey(rawInput, "q")) {
    return { handled: true, action: "close" };
  }

  if (matchesKey(rawInput, Key.escape) || rawInput === "b" || rawInput === "B") {
    return { handled: true, action: "mode-list" };
  }

  if (rawInput === "j" || matchesKey(rawInput, Key.down)) {
    return { handled: true, cursorDelta: 1 };
  }

  if (rawInput === "k" || matchesKey(rawInput, Key.up)) {
    return { handled: true, cursorDelta: -1 };
  }

  if (rawInput === "g") {
    return { handled: true, cursorAbsolute: 0 };
  }

  if (rawInput === "G") {
    return { handled: true, cursorAbsolute: -1 };
  }

  if (rawInput === "\t" || rawInput === "tab") {
    return { handled: true, action: "stream-toggle" };
  }

  return { handled: false };
}

/**
 * @summary 結果を適用
 * @description 入力結果を状態に適用し、次の操作を決定します。
 * @param result 入力処理結果
 * @param state 現在の状態
 * @returns 更新された状態とフラグ
 */
export function applyInputResult(
  result: HandleInputResult,
  state: {
    cursor: number;
    itemCount: number;
    mode: LiveViewMode;
    stream: LiveStreamView;
  },
): {
  cursor: number;
  mode: LiveViewMode;
  stream: LiveStreamView;
  shouldClose: boolean;
  shouldRender: boolean;
} {
  let { cursor, mode, stream } = state;
  const shouldClose = false;
  let shouldRender = false;

  if (!result.handled) {
    return { cursor, mode, stream, shouldClose, shouldRender };
  }

  if (result.action === "close") {
    return { cursor, mode, stream, shouldClose: true, shouldRender: false };
  }

  if (result.action === "mode-list") {
    mode = "list";
    shouldRender = true;
  }

  if (result.action === "mode-detail") {
    mode = "detail";
    shouldRender = true;
  }

  if (result.action === "stream-toggle") {
    stream = stream === "stdout" ? "stderr" : "stdout";
    shouldRender = true;
  }

  if (result.cursorDelta !== undefined) {
    cursor = Math.max(0, Math.min(state.itemCount - 1, cursor + result.cursorDelta));
    shouldRender = true;
  }

  if (result.cursorAbsolute !== undefined) {
    cursor = result.cursorAbsolute === -1 ? Math.max(0, state.itemCount - 1) : result.cursorAbsolute;
    shouldRender = true;
  }

  return { cursor, mode, stream, shouldClose, shouldRender };
}

// ============================================================================
// Constants
// ============================================================================

export const LIVE_PREVIEW_LINE_LIMIT = 36;
export const LIVE_LIST_WINDOW_SIZE = 20;
