/*
 * .pi/lib/agent/runtime-notifications.ts
 * ランタイムで一時的に注入する短命の通知を定義・整形する。
 * 恒常的な system prompt と直近の制御指示を分離するために存在する。
 * 関連ファイル: .pi/lib/agent/prompt-stack.ts, .pi/extensions/startup-context.ts, .pi/extensions/plan.ts
 */

/**
 * @abdd.meta
 * path: .pi/lib/agent/runtime-notifications.ts
 * role: ランタイム通知の型定義と整形を提供する
 * why: 直近バイアスを利用する短命の指示を system policy から分離するため
 * related: .pi/lib/agent/prompt-stack.ts, .pi/extensions/startup-context.ts, .pi/extensions/plan.ts
 * public_api: RuntimeNotification, createRuntimeNotification, formatRuntimeNotificationBlock
 * invariants: severity は定義済み列挙値のみ、message は空文字を許容しない
 * side_effects: なし
 * failure_modes: 空メッセージ入力時は undefined を返す
 * @abdd.explain
 * overview: 一時的な通知メッセージを構造化し、プロンプトに安全に埋め込める文字列へ整形する
 * what_it_does:
 *   - ランタイム通知の共通型を定義する
 *   - 空文字や無効入力を除外しながら通知を生成する
 *   - 複数の通知を見やすい短いブロックへ整形する
 * why_it_exists:
 *   - system prompt に時限的な指示が混ざり続けるのを防ぐため
 *   - 発火条件ごとの通知を共通フォーマットで扱うため
 * scope:
 *   in: source, message, severity, ttlTurns
 *   out: 整形済み通知文字列
 */

/**
 * 通知の重要度。
 * @summary 通知重要度
 */
export type RuntimeNotificationSeverity = "info" | "warning" | "critical";

/**
 * ランタイム通知。
 * @summary ランタイム通知
 */
export interface RuntimeNotification {
  source: string;
  message: string;
  severity: RuntimeNotificationSeverity;
  ttlTurns?: number;
}

/**
 * ランタイム通知を作成する。
 * @summary 通知作成
 * @param source 通知の発火元
 * @param message 通知本文
 * @param severity 通知の重要度
 * @param ttlTurns 推奨寿命
 * @returns 通知、または undefined
 */
export function createRuntimeNotification(
  source: string,
  message: string,
  severity: RuntimeNotificationSeverity = "info",
  ttlTurns?: number,
): RuntimeNotification | undefined {
  const normalizedSource = source.trim();
  const normalizedMessage = message.trim();
  if (!normalizedSource || !normalizedMessage) {
    return undefined;
  }

  return {
    source: normalizedSource,
    message: normalizedMessage,
    severity,
    ttlTurns,
  };
}

/**
 * 通知の見出しを整形する。
 * @summary 見出し整形
 * @param notification 通知
 * @returns 見出し
 */
function formatNotificationHeader(notification: RuntimeNotification): string {
  const ttl = typeof notification.ttlTurns === "number" ? ` ttl=${notification.ttlTurns}` : "";
  return `- [${notification.severity}] ${notification.source}${ttl}`;
}

/**
 * 通知一覧をプロンプト用の短いブロックに整形する。
 * @summary 通知整形
 * @param notifications 通知配列
 * @returns 整形済み文字列
 */
export function formatRuntimeNotificationBlock(
  notifications: RuntimeNotification[],
): string {
  const valid = notifications.filter((notification) => notification.message.trim().length > 0);
  if (valid.length === 0) {
    return "";
  }

  const lines: string[] = ["# Runtime Notifications"];
  for (const notification of valid) {
    lines.push(formatNotificationHeader(notification));
    lines.push(`  ${notification.message.trim()}`);
  }
  return lines.join("\n");
}
