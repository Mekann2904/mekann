/**
 * @abdd.meta
 * path: .pi/extensions/loop/reference-loader.ts
 * role: ループ拡張機能向けの参照読み込みユーティリティ。ファイル、URL、インラインテキストからの参照を読み込み正規化する
 * why: 複数の参照ソースを統一的に扱い、文字数制限と参照数制限を強制するため
 * related: .pi/extensions/loop.ts, .pi/extensions/loop/ssrf-protection.ts, .pi/lib/error-utils.js
 * public_api: loadReferences, LoopReference, LoadedReferenceResult
 * invariants:
 *   - 参照IDは R1, R2, ... の形式で連番割り当て
 *   - 参照数は最大24件、総文字数は最大30,000文字
 *   - 個別参照は最大8,000文字
 * side_effects:
 *   - ファイルシステムからの読み込み（refsFile, ローカルパス参照）
 *   - URLへのHTTPリクエスト（SSRF検証経由）
 * failure_modes:
 *   - refsFileが存在しない、または読み込み権限がない場合に警告を追加して継続
 *   - 参照内容が空の場合、警告を追加してスキップ
 *   - AbortSignalで処理が中断された場合、エラーをスロー
 * @abdd.explain
 * overview: ループ処理で使用する参照データをファイル、URL、インラインテキストから読み込む
 * what_it_does:
 *   - refs配列とrefsFileから参照指定を収集し正規化
 *   - 各参照を順次読み込み、安定ID（R1, R2...）を割り当て
 *   - 文字数制限と参照数制限を強制し、超過分は警告を追加して切り捨て
 *   - 空行と#で始まるコメント行を除外
 * why_it_exists:
 *   - 複数ソースの参照を統一的なインターフェースで扱うため
 *   - 参照データのサイズを制御し、処理の安定性を保証するため
 *   - SSRF攻撃を防ぎながら安全にURLをフェッチするため
 * scope:
 *   in: refs（参照指定文字列配列）、refsFile（参照ファイルパス、省略可）、cwd（作業ディレクトリ）、signal（AbortSignal、省略可）
 *   out: LoadedReferenceResult（読み込まれた参照配列と警告配列）
 */

// File: .pi/extensions/loop/reference-loader.ts
// Description: Reference loading utilities for loop extension.
// Why: Handles loading references from files, URLs, and inline text.
// Related: .pi/extensions/loop.ts, .pi/extensions/loop/ssrf-protection.ts

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

import { toErrorMessage } from "../../lib/error-utils.js";
import { validateUrlForSsrf } from "./ssrf-protection";

// ============================================================================
// Types
// ============================================================================

 /**
  * ループ参照データの構造を定義します。
  * @property id - 参照の一意識別子
  * @property source - 参照元のパス、URL、または識別子
  * @property title - 参照のタイトル
  * @property content - 参照の本文内容
  */
export interface LoopReference {
  id: string;
  source: string;
/**
   * /**
   * * 参照指定を読み込み、正規化して結果を返す
   * *
   * * @param input - 参照読み込みの入力オブジェクト
   * * @param input.refs - 参照指定文字列の配列
   * * @param input.refsFile - 参照ファイルのパス（省略可）
   * * @param input.cwd - 作業ディレクトリのパス
   * * @param signal - 処理を中断するためのAbortSignal（省略可）
   * * @returns 読み込まれた参照の結果を含むPromise
   * * @example
   * * const result = await loadReferences({
   * *   refs: ['./src/index.ts', './
   */
  title: string;
  content: string;
}

 /**
  * 参照読み込みの結果
  * @param references - 読み込まれた参照の配列
  * @param warnings - 警告メッセージの配列
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
  * 参照情報を読み込む
  * @param input 参照リストとパスを含む入力オブジェクト
  * @param signal 中断シグナル
  * @returns 読み込み結果
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
  * 指定されたURLからテキストを取得する
  * @param url 取得先のURL
  * @param signal リクエストの中断シグナル
  * @returns 取得したテキスト
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

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...[truncated]`;
}

function toPreview(value: string, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}...`;
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new Error("loop aborted");
  }
}
