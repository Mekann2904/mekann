/**
 * cache-friendly-prompt/report/format.ts — 共通の leaf フォーマッタ。
 *
 * 集計 (aggregate) / 描画 (svg) / 表 (tables) / 文書 (document) の全モジュールから
 * 使われる純粋関数だけを置く。他の report/* モジュールには依存しない。
 */

import type { PercentileSummary } from "../reportTypes.js";

export function shortHash(hash: string | undefined): string {
  return hash ? hash.slice(0, 8) : "";
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}


export function formatPercentiles(value: PercentileSummary): string {
  return `p50 ${formatPct(value.p50)} / p90 ${formatPct(value.p90)} / p99 ${formatPct(value.p99)}`;
}

export function formatPct(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return `${value}`;
  const units = ["B", "KiB", "MiB", "GiB"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} B` : `${scaled.toFixed(1)} ${units[unit]} (${value} B)`;
}


export function formatTimestamp(ts: string | null): string {
  return ts ? ts.slice(0, 16) : "n/a";
}

