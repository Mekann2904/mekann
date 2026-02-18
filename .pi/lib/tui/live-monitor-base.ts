/**
 * Generic live monitor base module.
 * Provides common patterns for live monitoring views (subagents, agent-teams, etc.).
 * Eliminates DRY violations between similar live monitor implementations.
 */

import { matchesKey, Key, truncateToWidth } from "@mariozechner/pi-tui";

import { formatDurationMs, formatBytes, formatClockTime } from "../format-utils.js";
import { computeLiveWindow } from "../agent-utils.js";
import { getLiveStatusGlyph, isEnterInput, finalizeLiveLines } from "../live-view-utils.js";
import { appendTail, countOccurrences, estimateLineCount, renderPreviewWithMarkdown } from "./tui-utils.js";

// ============================================================================
// Core Types
// ============================================================================

 /**
  * ライブアイテムの状態。
  */
export type LiveItemStatus = "pending" | "running" | "completed" | "failed";

 /**
  * ライブストリームの表示オプション
  */
export type LiveStreamView = "stdout" | "stderr";

 /**
  * ライブビューのモードオプション。
  */
export type LiveViewMode = "list" | "detail";

 /**
  * ライブモニターのアイテムの基底インターフェース
  * @param id アイテムID
  * @param status ステータス
  * @param startedAtMs 開始日時（ミリ秒）
  * @param finishedAtMs 終了日時（ミリ秒）
  * @param lastChunkAtMs 最後のチャンク日時（ミリ秒）
  * @param summary 概要
  * @param error エラー内容
  * @param stdoutTail 標準出力の末尾
  * @param stderrTail 標準エラー出力の末尾
  * @param stdoutBytes 標準出力のバイト数
  * @param stderrBytes 標準エラー出力のバイト数
  * @param stdoutNewlineCount 標準出力の改行数
  * @param stderrNewlineCount 標準エラー出力の改行数
  * @param stdoutEndsWithNewline 標準出力が改行で終わるか
  * @param stderrEndsWithNewline 標準エラー出力が改行で終わるか
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
  * ライブモニタコントローラの基底インターフェース
  * @param markStarted 開始をマーク
  * @param appendChunk チャンクを追加
  * @param markFinished 完了をマーク
  * @param close クローズ処理
  * @param wait 待機処理
  */
export interface BaseLiveMonitorController {
  markStarted: (id: string) => void;
  appendChunk: (id: string, stream: LiveStreamView, chunk: string) => void;
  markFinished: (id: string, status: "completed" | "failed", summary: string, error?: string) => void;
  close: () => void;
  wait: () => Promise<void>;
}

 /**
  * ライブアイテム作成用の入力
  * @param id アイテムID
  * @param name アイテム名
  */
export interface CreateLiveItemInput {
  id: string;
  name?: string;
}

/**
 * Options for createLiveMonitorFactory.
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
  * デフォルト値を持つベースライブアイテムを作成する
  * @param input 作成に必要な入力データ
  * @returns 作成されたベースライブアイテム
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
  * @param item 対象のアイテム
  * @param stream 追加先のストリーム（"stdout" または "stderr"）
  * @param chunk 追加するテキストチャンク
  * @returns なし
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
  * @param item ベースライブアイテム
  * @param stream ライブストリームビュー
  * @param autoSwitchOnFailure 失敗時に自動切り替えするか
  * @returns ストリームの末尾
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
  * ストリームのバイト数を取得
  * @param item ライブアイテム
  * @param stream 対象のストリーム
  * @returns バイト数
  */
export function getStreamBytes(item: BaseLiveItem, stream: LiveStreamView): number {
  return stream === "stdout" ? item.stdoutBytes : item.stderrBytes;
}

/**
 * Get estimated stream line count.
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
  * ライブビューの共通ヘッダーデータ
  * @param title タイトル
  * @param mode 表示モード
  * @param running 実行中の数
  * @param completed 完了した数
  * @param failed 失敗した数
  * @param total 合計数
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
  * ライブビューの共通ヘッダーを描画する
  * @param data ヘッダー表示データ
  * @param width 描画幅
  * @param theme テーマ設定
  * @returns 描画されたヘッダー行の配列
  */
export function renderLiveViewHeader(
  data: LiveViewHeaderData,
  width: number,
  theme: any,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  add(theme.bold(theme.fg("accent", `${data.title} [${data.mode}]`)));
  add(
    theme.fg(
      "dim",
      `running ${data.running}/${data.total} | completed ${data.completed} | failed ${data.failed} | updated ${formatClockTime(Date.now())}`,
    ),
  );

  return lines;
}

 /**
  * キーボード操作のヒントを描画する
  * @param width 表示幅
  * @param theme テーマ設定
  * @returns 描画行の配列
  */
export function renderListKeyboardHints(width: number, theme: any): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  add(
    theme.fg(
      "dim",
      "[j/k] move  [up/down] move  [g/G] jump  [enter] detail  [tab] stream  [q] close",
    ),
  );

  return lines;
}

 /**
  * 詳細画面のキーボード操作ヒントを描画する
  * @param width 画面幅
  * @param theme テーマ設定
  * @param extraKeys 追加キーのヒント
  * @returns 描画用の文字列配列
  */
export function renderDetailKeyboardHints(
  width: number,
  theme: any,
  extraKeys?: string,
): string[] {
  const lines: string[] = [];
  const add = (line = "") => lines.push(truncateToWidth(line, width));

  const baseKeys = "[j/k] move target  [up/down] move  [g/G] jump  [tab] stdout/stderr";
  const endKeys = "[b|esc] back  [q] close";
  const fullHint = extraKeys
    ? `${baseKeys}  ${extraKeys}  ${endKeys}`
    : `${baseKeys}  ${endKeys}`;

  add(theme.fg("dim", fullHint));

  return lines;
}

 /**
  * リストウィンドウをページネーション付きで描画する
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
  theme: any,
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
  * 単一のリストアイテム行を描画する
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
  theme: any,
  extraMeta?: string,
): string {
  const prefix = isSelected ? ">" : " ";
  const glyph = getLiveStatusGlyph(item.status);
  const statusText = item.status.padEnd(9, " ");
  const base = `${prefix} [${glyph}] ${item.id}${item.name ? ` (${item.name})` : ""}`;
  const outLines = getStreamLineCount(item, "stdout");
  const errLines = getStreamLineCount(item, "stderr");

  const meta = [
    statusText,
    formatDurationMs(item),
    `out:${formatBytes(item.stdoutBytes)}/${outLines}l`,
    `err:${formatBytes(item.stderrBytes)}/${errLines}l`,
    extraMeta,
  ]
    .filter(Boolean)
    .join(" ");

  return `${isSelected ? theme.fg("accent", base) : base} ${theme.fg("dim", meta)}`;
}

/**
 * Render selected item summary.
 */
export function renderSelectedItemSummary<T>(
  items: T[],
  cursor: number,
  getItemId: (item: T) => string,
  getItemName: (item: T) => string | undefined,
  getItemStatus: (item: T) => LiveItemStatus,
  getItemElapsed: (item: T) => string,
  width: number,
  theme: any,
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
  * @param item 対象アイテム
  * @param cursor 選択位置のインデックス
  * @param total 全体の件数
  * @param getItemId ID取得関数
  * @param getItemName 名前取得関数
  * @param width 表示幅
  * @param theme テーマオブジェクト
  * @returns 描画された行の配列
  */
export function renderDetailHeader<T>(
  item: T,
  cursor: number,
  total: number,
  getItemId: (item: T) => string,
  getItemName: (item: T) => string | undefined,
  width: number,
  theme: any,
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
  theme: any,
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
  * 入力処理の結果を表します。
  * @param handled 入力が処理されたかどうか
  * @param action 実行するアクション（閉じる、モード切り替え等）
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
  * リストモードでのキーボード入力を処理する。
  * @param rawInput 入力されたキー文字列
  * @returns 処理結果を表すオブジェクト
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
 * Handle common keyboard input for detail mode.
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
  * 入力結果を状態に適用する
  * @param result 入力ハンドリングの結果
  * @param state 現在の状態
  * @returns 更新後の状態と画面操作フラグ
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
