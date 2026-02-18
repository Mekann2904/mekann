/**
 * @abdd.meta
 * path: .pi/extensions/loop/ssrf-protection.ts
 * role: SSRF防御ユーティリティ
 * why: Server-Side Request Forgery (SSRF) 攻撃を防止し、プライベート/内部ネットワークへの不正アクセスをブロックするため
 * related: .pi/extensions/loop.ts, .pi/extensions/loop/reference-loader.ts
 * public_api: isBlockedHostname, isPrivateOrReservedIP
 * invariants: 入力文字列は trim および toLowerCase により正規化されて判定される
 * side_effects: 外部DNS問い合わせ (dnsLookup) をインポートしているが、本ファイル内のエクスポート関数は同期的に計算のみを行う
 * failure_modes: 不正なIPアドレス形式、無効なホスト名文字列が入力された場合の挙動は個別の関数実装に依存する
 * @abdd.explain
 * overview: URL検証におけるSSRF対策のため、ホスト名とIPアドレスがプライベート or 内部ネットワークに属するかを判定するモジュール
 * what_it_does:
 *   - ブロック対象のホスト名パターン（localhost等）に基づきホスト名を検証する
 *   - IPアドレスがIPv4のプライベート範囲、予約済み範囲、またはIPv6のループバック/リンクローカル/ユニークローカルかを判定する
 *   - IPv4マッピングされたIPv6アドレスをIPv4として扱い判定する
 * why_it_exists:
 *   - 外部リソース取得時に、攻撃者が内部システムへアクセスするリスクを排除するため
 *   - loop拡張機能において、安全な外部参照のみを許可するため
 * scope:
 *   in: ホスト名文字列、IPアドレス文字列
 *   out: ブロック対象か否かを示す真偽値 (boolean)
 */

// File: .pi/extensions/loop/ssrf-protection.ts
// Description: SSRF protection utilities for URL validation in loop extension.
// Why: Prevents Server-Side Request Forgery by blocking access to private/internal networks.
// Related: .pi/extensions/loop.ts, .pi/extensions/loop/reference-loader.ts

import { lookup as dnsLookup } from "node:dns/promises";

// ============================================================================
// SSRF Protection
// ============================================================================

/**
 * List of blocked hostname patterns for SSRF protection.
 * Blocks localhost, local domains, and internal domains.
 */
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^::$/,
];

/**
 * ホスト名を判定
 * @summary ブロック対象か判定
 * @param hostname チェック対象のホスト名
 * @returns ブロック対象の場合はtrue
 */
export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().trim();
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if an IPv4 address is private or reserved.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(isNaN)) {
    return false;
  }

  const [a, b] = parts;

  // 10.0.0.0/8
  if (a === 10) return true;

  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local)
  if (a === 169 && b === 254) return true;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved for future use)
  if (a >= 240) return true;

  return false;
}

/**
 * プライベート・予約済みIP判定
 * @summary IPアドレス種別を判定
 * @param ip チェック対象のIPアドレス文字列
 * @returns プライベートまたは予約済みの場合はtrue
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  // Handle IPv6 addresses
  const normalizedIP = ip.toLowerCase();

  // IPv6 loopback
  if (normalizedIP === "::1" || normalizedIP === "::") {
    return true;
  }

  // IPv6 link-local (fe80::/10)
  if (normalizedIP.startsWith("fe80:")) {
    return true;
  }

  // IPv6 unique local (fc00::/7)
  if (normalizedIP.startsWith("fc") || normalizedIP.startsWith("fd")) {
    return true;
  }

  // IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  const ipv4Mapped = normalizedIP.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped) {
    return isPrivateIPv4(ipv4Mapped[1]);
  }

  // Parse IPv4 address
  const parts = ip.split(".");
  if (parts.length !== 4) {
    // Not a valid IPv4, could be IPv6 or invalid
    return false;
  }

  return isPrivateIPv4(ip);
}

 /**
  * SSRF保護のためURLを検証する
  * @param urlString 検証対象のURL文字列
  * @returns 解決時に値を返さないPromise
  */
export async function validateUrlForSsrf(urlString: string): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL: ${urlString}`);
  }

  // Only allow http and https protocols
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`URL protocol not allowed: ${parsedUrl.protocol}`);
  }

  const hostname = parsedUrl.hostname;

  // Check blocked hostname patterns
  if (isBlockedHostname(hostname)) {
    throw new Error(`Access to hostname blocked (SSRF protection): ${hostname}`);
  }

  // Resolve DNS and check IP
  try {
    const dnsResult = await dnsLookup(hostname);
    const resolvedIP = dnsResult.address;

    if (isPrivateOrReservedIP(resolvedIP)) {
      throw new Error(
        `Access to private/reserved IP blocked (SSRF protection): ${hostname} resolves to ${resolvedIP}`
      );
    }
  } catch (error) {
    // If it's our SSRF error, re-throw it
    if (error instanceof Error && error.message.includes("SSRF protection")) {
      throw error;
    }
    // DNS resolution failed - this could be a security issue or just a bad domain
    // We'll let it through and let the fetch fail naturally
  }
}
