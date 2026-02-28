/**
 * @abdd.meta
 * path: .pi/extensions/mcp/tools/shared.ts
 * role: MCPツール用の共通ヘルパー関数
 * why: ツール間で共有されるロジックを集約し、コード重複を削減するため
 * related: ../mcp-client.ts
 * public_api: makeSuccessResult, makeErrorResult, detectConnectionType, autoConnectFromConfig, dispatchNotification, notificationHandlers
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: MCPツール用の共通ヘルパー関数
 * what_it_does:
 *   - 結果作成ヘルパー
 *   - 接続タイプ検出
 *   - 自動接続
 *   - 通知ディスパッチ
 * why_it_exists:
 *   - 複数のツールで共有されるロジックを一箇所に集約するため
 * scope:
 *   in: なし
 *   out: connection.ts, resources.ts, prompts.ts
 */

import type { McpNotificationHandler, McpNotificationType, McpNotification, McpAuthProvider } from "../../../lib/mcp/types.js";
import { mcpManager, type McpConnectionType } from "../../../lib/mcp/connection-manager.js";
import { loadMcpConfig, getEnabledServers } from "../../../lib/mcp/config-loader.js";

// ============================================================================
// 型定義
// ============================================================================

/** 自動接続結果 */
export interface AutoConnectResult {
  succeeded: string[];
  failed: Array<{ id: string; error: string }>;
}

/** 通知ハンドラー登録情報 */
export interface NotificationHandlerRegistration {
  handler: McpNotificationHandler;
  types?: McpNotificationType[];
  connectionId?: string;
}

// ============================================================================
// グローバル状態
// ============================================================================

/** 通知ハンドラーの管理 */
export const notificationHandlers = new Map<string, NotificationHandlerRegistration>();

let handlerIdCounter = 0;

// ============================================================================
// 結果作成ヘルパー
// ============================================================================

/**
 * 成功結果を作成する
 * @summary 成功結果を作成
 * @param text 結果テキスト
 * @param details 詳細情報
 * @returns 成功結果オブジェクト
 */
export function makeSuccessResult(
  text: string,
  details: Record<string, unknown>
): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> } {
  return {
    content: [{ type: "text", text }],
    details
  };
}

/**
 * エラー結果を作成する
 * @summary エラー結果を作成
 * @param text エラーテキスト
 * @param details 詳細情報
 * @returns エラー結果オブジェクト
 */
export function makeErrorResult(
  text: string,
  details: Record<string, unknown> = {}
): { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown>; isError: boolean } {
  return {
    content: [{ type: "text", text }],
    details,
    isError: true
  };
}

// ============================================================================
// 接続タイプ検出
// ============================================================================

/**
 * URLから接続タイプを判定する
 * @summary 接続タイプを検出
 * @param url サーバーURL
 * @returns 接続タイプ
 */
export function detectConnectionType(url: string): McpConnectionType | undefined {
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return 'websocket';
  }
  if (url.startsWith('sse://') || url.startsWith('http+sse://') || url.startsWith('https+sse://')) {
    return 'sse';
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return 'http';
  }
  // stdio: URLパターンでない場合
  if (!url.includes('://')) {
    return 'stdio';
  }
  return undefined;
}

// ============================================================================
// 自動接続
// ============================================================================

/**
 * 設定ファイルから自動接続を実行する
 * @summary 自動接続を実行
 * @param ctx 拡張コンテキスト
 * @returns 接続結果
 */
export async function autoConnectFromConfig(
  ctx: { ui: { notify: (msg: string, type: "info" | "warning" | "error") => void } }
): Promise<AutoConnectResult> {
  const result: AutoConnectResult = { succeeded: [], failed: [] };

  try {
    const config = await loadMcpConfig();
    const enabledServers = getEnabledServers(config);

    if (enabledServers.length === 0) {
      return result;
    }

    ctx.ui.notify(`Auto-connecting ${enabledServers.length} MCP server(s)...`, "info");

    for (const server of enabledServers) {
      try {
        // Cast auth from config to McpAuthProvider (validated by config-loader)
        const auth = server.auth as McpAuthProvider | undefined;
        await mcpManager.connect({
          id: server.id,
          url: server.url,
          timeout: server.timeout,
          type: detectConnectionType(server.url),
          auth,
          headers: server.headers
        });
        result.succeeded.push(server.id);
        ctx.ui.notify(`Connected to MCP server: ${server.id}`, "info");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        result.failed.push({ id: server.id, error: errorMsg });
        ctx.ui.notify(`Failed to connect ${server.id}: ${errorMsg}`, "error");
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to load MCP config: ${errorMsg}`, "warning");
  }

  return result;
}

// ============================================================================
// 通知ハンドラー管理
// ============================================================================

/**
 * 通知ハンドラーを登録する
 * @summary 通知ハンドラーを登録
 * @param registration ハンドラー登録情報
 * @returns ハンドラーID
 */
export function registerNotificationHandler(registration: NotificationHandlerRegistration): string {
  const id = `handler-${++handlerIdCounter}`;
  notificationHandlers.set(id, registration);
  return id;
}

/**
 * 通知ハンドラーを削除する
 * @summary 通知ハンドラーを削除
 * @param id ハンドラーID
 * @returns 削除に成功した場合true
 */
export function unregisterNotificationHandler(id: string): boolean {
  return notificationHandlers.delete(id);
}

/**
 * 内部通知ディスパッチャー
 * @summary 通知をディスパッチ
 * @param notification 通知オブジェクト
 */
export function dispatchNotification(notification: McpNotification): void {
  for (const entry of Array.from(notificationHandlers.entries())) {
    const [id, registration] = entry;
    // タイプフィルター
    if (registration.types && !registration.types.includes(notification.type)) {
      continue;
    }
    // 接続IDフィルター
    if (registration.connectionId && registration.connectionId !== notification.connectionId) {
      continue;
    }
    // ハンドラー実行（エラーはキャッチ）
    try {
      const result = registration.handler(notification);
      if (result instanceof Promise) {
        result.catch(err => console.error(`Notification handler ${id} error:`, err));
      }
    } catch (err) {
      console.error(`Notification handler ${id} error:`, err);
    }
  }
}
