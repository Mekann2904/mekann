/**
 * @abdd.meta
 * path: .pi/extensions/loop/reference-loader.ts
 * role: 外部参照データの取得、解析、および整形を行うローダー
 * why: ループ処理においてファイル、URL、テキストからの参照データを統一的かつ安全に読み込むため
 * related: .pi/extensions/loop.ts, .pi/extensions/loop/ssrf-protection.ts, ../../lib/text-utils.ts
 * public_api: loadReferences, LoopReference, LoadedReferenceResult
 * invariants: 参照データのIDはR1から始まる連番、総文字数はmaxReferenceCharsTotal以下、各参照はmaxReferenceCharsPerItem以下
 * side_effects: ファイルシステムからの読み込み、HTTPリクエストの送信
 * failure_modes: ファイル読み込みエラー、URLアクセス失敗、文字数制限超過によるデータ切り捨て
 * @abdd.explain
 * overview: 入力された参照定義（パス、URL、文字列）を解決し、内容とメタデータを抽出して上限値内に収めたデータ構造を返すモジュール
 * what_it_does:
 *   - 参照定義の正規化とリスト化
 *   - ファイルパスの解決と内容の読み込み
 *   - URLからのコンテンツ取得（SSRF保護付き）
 *   - コンテンツのトリミング（文字数制限）とID付与
 * why_it_exists:
 *   - 外部リソースへのアクセスを一元管理し、安全性とリソース消費を制御するため
 *   - 異なるソース（ファイル、URL等）からのデータを統一的な形式で扱うため
 * scope:
 *   in: 参照定義リスト、参照ファイルパス、作業ディレクトリ、AbortSignal
 *   out: 整形済み参照データリスト（LoopReference）、警告メッセージリスト
 */

// File: .pi/extensions/loop/reference-loader.ts
// Description: Reference loading utilities for loop extension.
// Why: Handles loading references from files, URLs, and inline text.
// Related: .pi/extensions/loop.ts, .pi/extensions/loop/ssrf-protection.ts

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

import { toErrorMessage } from "../../lib/error-utils.js";
import {
  truncateTextWithMarker as truncateText,
  toPreview,
  throwIfAborted,
} from "../../lib/text-utils.js";
import { validateUrlForSsrf } from "./ssrf-protection";

// ============================================================================
// Types
// ============================================================================

/**
 * ループ参照のデータ構造
 * @summary ループ参照定義
 */
export interface LoopReference {
  id: string;
  source: string;
  title: string;
  content: string;
}

/**
 * 参照読み込みの結果を表すインターフェース
 * @summary 参照読込結果
 * @returns 解析済みの参照データと警告リスト
 */
export interface LoadedReferenceResult {
  references: LoopReference[];
  warnings: string[];
}

// ============================================================================
// Limits
// ============================================================================

const LIMITS = {
  maxReferences: 24,
  maxReferenceCharsPerItem: 8_000,
  maxReferenceCharsTotal: 30_000,
};

// ============================================================================
// Reference Loading
// ============================================================================

/**
 * 外部参照を読み込み、解析結果を返す
 * @summary 参照読込
 * @param input - 参照パスやファイルの設定を含むオブジェクト
 * @param signal - 処理を中断するためのAbortSignal（省略可）
 * @returns 読み込まれた参照の結果と警告を含むPromise
 */
export async function loadReferences(
  input: { refs: string[]; refsFile?: string; cwd: string },
  signal?: AbortSignal,
): Promise<LoadedReferenceResult> {
  const warnings: string[] = [];
  const specs: string[] = [];

  for (const ref of input.refs) {
    const normalized = normalizeRefSpec(ref);
    if (normalized) specs.push(normalized);
  }

  if (input.refsFile) {
    const refsFilePath = resolvePath(input.cwd, input.refsFile);
    try {
      const raw = readFileSync(refsFilePath, "utf-8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = normalizeRefSpec(line);
        if (!trimmed || trimmed.startsWith("#")) continue;
        specs.push(trimmed);
      }
    } catch (error) {
      warnings.push(`Could not read refs file: ${refsFilePath} (${toErrorMessage(error)})`);
    }
  }

  if (specs.length > LIMITS.maxReferences) {
    warnings.push(`Reference count capped at ${LIMITS.maxReferences}. Extra references were ignored.`);
  }

  const clippedSpecs = specs.slice(0, LIMITS.maxReferences);
  const loaded: LoopReference[] = [];
  let usedChars = 0;

  // Load refs in order and assign stable IDs (R1, R2, ...).
  for (let i = 0; i < clippedSpecs.length; i++) {
    throwIfAborted(signal);
    const spec = clippedSpecs[i];
    const id = `R${i + 1}`;

    try {
      const fetched = await loadSingleReference(spec, input.cwd, signal);
      if (!fetched.content.trim()) {
        warnings.push(`Reference ${id} has empty content and was skipped: ${spec}`);
        continue;
      }

      // Bound total reference size to avoid polluting context windows.
      const remainingBudget = LIMITS.maxReferenceCharsTotal - usedChars;
      if (remainingBudget <= 0) {
        warnings.push("Reference text budget reached. Remaining references were skipped.");
        break;
      }

      const clipped = truncateText(fetched.content, Math.min(LIMITS.maxReferenceCharsPerItem, remainingBudget));
      usedChars += clipped.length;

      loaded.push({
        id,
        source: fetched.source,
        title: fetched.title,
        content: clipped,
      });
    } catch (error) {
      warnings.push(`Reference ${id} could not be loaded (${spec}): ${toErrorMessage(error)}`);
    }
  }

  return {
    references: loaded,
    warnings,
  };
}
/**
 * 指定されたURLからテキストを取得する
 *
 * SSRF対策としてURLの検証を行い、20秒のタイムアウトを設定してフェッチを行う。
 *
 * @param url - 取得対象のURL
 * @param signal - 処理を中断するためのAbortSignal（省略可能）
 * @returns 取得したテキストコンテンツ
 * @example
 * const text = await fetchTextFromUrl("https://example.com/data.txt");
 * @example
 * const controller = new AbortController();
 * const text = await fetchTextFromUrl("https://example.com/data.txt", controller.signal);
 */

async function loadSingleReference(
  spec: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<{ source: string; title: string; content: string }> {
  if (looksLikeUrl(spec)) {
    const text = await fetchTextFromUrl(spec, signal);
    return {
      source: spec,
      title: `URL: ${spec}`,
      content: text,
    };
  }

  const candidatePath = resolvePath(cwd, spec);
  if (existsSync(candidatePath)) {
    const stats = statSync(candidatePath);
    if (!stats.isFile()) {
      throw new Error("path exists but is not a file");
    }

    const content = readFileSync(candidatePath, "utf-8");
    return {
      source: candidatePath,
      title: `File: ${basename(candidatePath)}`,
      content,
    };
  }

  return {
    source: "inline",
    title: `Inline reference: ${toPreview(spec, 42)}`,
    content: spec,
  };
}

/**
 * 指定されたURLからテキストデータを取得する
 * @summary テキスト取得
 * @param url - 取得先のURL
 * @param signal - 処理を中断するためのAbortSignal（省略可）
 * @returns 取得したテキストデータを含むPromise
 */
export async function fetchTextFromUrl(url: string, signal?: AbortSignal): Promise<string> {
  // SSRF protection: validate URL before fetching
  await validateUrlForSsrf(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const relayAbort = () => controller.abort();
  signal?.addEventListener("abort", relayAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "pi-loop-extension/1.0",
        accept: "text/plain,text/markdown,text/html,application/json;q=0.9,*/*;q=0.5",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.text();
    if (looksLikeHtml(body)) {
      return htmlToText(body);
    }
    return body;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", relayAbort);
  }
}

// ============================================================================
// Utilities
// ============================================================================

function normalizeRefSpec(value: string): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("@")) return trimmed.slice(1).trim();
  return trimmed;
}

function resolvePath(cwd: string, pathLike: string): string {
  if (isAbsolute(pathLike)) return pathLike;
  return resolve(cwd, pathLike);
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function looksLikeHtml(value: string): boolean {
  return /<html[\s>]|<!doctype html/i.test(value);
}

function htmlToText(value: string): string {
  const withoutScripts = value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

