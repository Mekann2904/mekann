#!/usr/bin/env npx tsx
/**
 * JSDoc自動生成スクリプト
 *
 * TypeScriptソースファイルからJSDocがない関数・クラス・インターフェース・型を検出し、
 * pi SDKを使用して日本語のJSDocを生成してソースコードに挿入する。
 *
 * 使用方法:
 *   npx tsx scripts/add-jsdoc.ts [options] [files...]
 *
 * オプション:
 *   --dry-run       変更を適用せず、生成内容のみ表示
 *   --check         JSDocがない要素の数のみ表示（CI用）
 *   --verbose       詳細ログを出力
 *   --limit N       処理する要素数の上限（デフォルト: 50）
 *   --file PATH     特定ファイルのみ処理
 *   --regenerate    既存のJSDocも含めて再生成（--all も可）
 *   --batch-size N  バッチ処理の要素数（デフォルト: 5、0で無効）
 *   --force         キャッシュを無視して強制再生成
 *   --metrics       品質メトリクスをJSON出力
 *   --no-cache      キャッシュを使用しない
 *
 * LLM設定:
 *   pi SDKのAuthStorageとstreamSimpleを使用して、
 *   piの設定から自動的にプロバイダー、モデル、APIキーを取得する。
 *
 * 環境変数:
 *   JSDOC_MAX_PARALLEL  並列数の上書き（デフォルト: 10）
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join, relative, dirname } from 'path';
import { createHash } from 'crypto';
import * as ts from 'typescript';
import { fileURLToPath } from 'url';
import { streamSimple, getModel, type Context } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';

// 既存のライブラリからインポート
import { runWithConcurrencyLimit } from '../.pi/lib/concurrency';
import { resolveUnifiedLimits, isSnapshotProviderInitialized } from '../.pi/lib/unified-limit-resolver';
import { getSchedulerAwareLimit, notifyScheduler429, notifySchedulerSuccess } from '../.pi/lib/adaptive-rate-controller';
import { retryWithBackoff, isRetryableError } from '../.pi/lib/retry-with-backoff';
import { buildRateLimitKey } from '../.pi/lib/runtime-utils';
import { getConcurrencyLimit } from '../.pi/lib/provider-limits';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// 定数定義
// ============================================================================

/** キャッシュディレクトリ */
const CACHE_DIR = join(homedir(), '.pi', 'cache', 'jsdoc');
/** デフォルトバッチサイズ */
const DEFAULT_BATCH_SIZE = 5;
/** デフォルト並列数 */
const DEFAULT_PARALLEL_LIMIT = 10;
/** バッチ区切り文字（LLM出力パース用） */
const BATCH_DELIMITER = '===JSDOC_ELEMENT_SEPARATOR===';
/** 並列度の最小値 */
const MIN_PARALLEL_LIMIT = 1;
/** 並列度の最大値 */
const MAX_PARALLEL_LIMIT = 20;
/** LLM呼び出しのデフォルトタイムアウト（ミリ秒） */
const DEFAULT_LLM_TIMEOUT_MS = 60000; // 60秒
/** APPEND_SYSTEM.md のパス */
const APPEND_SYSTEM_PATH = join(__dirname, '..', '.pi', 'APPEND_SYSTEM.md');
/** APPEND_SYSTEM.md 内のJSDocプロンプト開始マーカー */
const JSDOC_SYSTEM_PROMPT_START = '<!-- JSDOC_SYSTEM_PROMPT_START -->';
/** APPEND_SYSTEM.md 内のJSDocプロンプト終了マーカー */
const JSDOC_SYSTEM_PROMPT_END = '<!-- JSDOC_SYSTEM_PROMPT_END -->';
/** APPEND_SYSTEM.md が読めない場合のフォールバック */
const JSDOC_SYSTEM_PROMPT_FALLBACK = 'あなたはTypeScriptのJSDocコメント生成アシスタントです。日本語で簡潔かつ正確なJSDocを生成してください。必須タグは@summary/@param/@returns。条件付きで@throws/@deprecated、イベント駆動では@fires/@listensを付与してください。コードブロック記法を使わず、生のJSDocのみを出力してください。';

// ============================================================================
// Types
// ============================================================================

interface ElementInfo {
  type: 'function' | 'class' | 'interface' | 'type' | 'method' | 'property';
  name: string;
  line: number;
  signature: string;
  existingJsDocRange?: JsDocRange;
  context: string;
  filePath: string;
}

interface JsDocRange {
  startLine: number;
  endLine: number;
}

interface GenerationResult {
  element: ElementInfo;
  jsDoc: string | null;
  errorMessage?: string;
  fromCache?: boolean;
}

interface Options {
  dryRun: boolean;
  check: boolean;
  verbose: boolean;
  limit: number;
  file?: string;
  /** 既存のJSDocも再生成する */
  regenerate: boolean;
  /** バッチ処理の要素数（0で無効） */
  batchSize: number;
  /** キャッシュを無視して強制再生成 */
  force: boolean;
  /** キャッシュを使用しない */
  noCache: boolean;
  /** 品質メトリクスを出力 */
  metrics: boolean;
}

// ============================================================================
// 品質メトリクス型定義
// ============================================================================

interface QualityMetrics {
  /** 処理されたファイル数 */
  filesProcessed: number;
  /** 処理された要素数 */
  elementsProcessed: number;
  /** 成功した要素数 */
  elementsSucceeded: number;
  /** キャッシュヒット数 */
  cacheHits: number;
  /** バッチ処理数 */
  batchCalls: number;
  /** 個別処理数（バッチフォールバック含む） */
  individualCalls: number;
  /** 平均JSDoc品質スコア（0-100） */
  averageQualityScore: number;
  /** @paramカバレッジ（%） */
  paramCoverage: number;
  /** @returnsカバレッジ（%） */
  returnsCoverage: number;
  /** 処理時間（ミリ秒） */
  processingTimeMs: number;
  /** エラー数 */
  errorCount: number;
}

interface ElementQualityScore {
  elementName: string;
  elementType: string;
  /** 品質スコア（0-100） */
  score: number;
  /** @paramの数 */
  paramCount: number;
  /** 期待される@param数 */
  expectedParamCount: number;
  /** @returnsの有無 */
  hasReturns: boolean;
  /** @returnsが期待されるか */
  expectsReturns: boolean;
}

// ============================================================================
// キャッシュ型定義
// ============================================================================

interface CacheEntry {
  /** 要素の一意識別子 */
  elementKey: string;
  /** 生成されたJSDoc */
  jsDoc: string;
  /** ファイルハッシュ */
  fileHash: string;
  /** キャッシュ作成日時 */
  createdAt: number;
  /** モデルID */
  modelId: string;
}

interface BatchResult {
  results: Map<string, string | null>;
  failedElementKeys: string[];
}

// ============================================================================
// System Prompt Loading
// ============================================================================

function loadJsDocSystemPromptFromAppendSystem(): string {
  try {
    if (!existsSync(APPEND_SYSTEM_PATH)) {
      return JSDOC_SYSTEM_PROMPT_FALLBACK;
    }

    const content = readFileSync(APPEND_SYSTEM_PATH, 'utf-8');
    const start = content.indexOf(JSDOC_SYSTEM_PROMPT_START);
    const end = content.indexOf(JSDOC_SYSTEM_PROMPT_END);

    if (start === -1 || end === -1 || end <= start) {
      return JSDOC_SYSTEM_PROMPT_FALLBACK;
    }

    const bodyStart = start + JSDOC_SYSTEM_PROMPT_START.length;
    const extracted = content.slice(bodyStart, end).trim();
    return extracted || JSDOC_SYSTEM_PROMPT_FALLBACK;
  } catch {
    return JSDOC_SYSTEM_PROMPT_FALLBACK;
  }
}

function getJsDocSystemPrompt(mode: 'single' | 'batch'): string {
  const base = loadJsDocSystemPromptFromAppendSystem();
  if (mode === 'batch') {
    return `${base}\n区切り文字を正確に使用してください。`;
  }
  return base;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const startTime = Date.now();
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('=== JSDoc自動生成スクリプト ===\n');

  if (options.check) {
    await checkMode(options);
    return;
  }

  if (options.dryRun) {
    console.log('ドライランモード: 変更は適用されません\n');
  }

  // pi SDKを使用してLLM設定を初期化
  console.log('pi設定を読み込み中...');
  const { model, apiKey } = await initializePiSdk();

  if (!model) {
    console.error('利用可能なモデルが見つかりません');
    process.exit(1);
  }

  if (!apiKey) {
    console.error('APIキーが見つかりません');
    process.exit(1);
  }

  console.log(`モデル: ${model.provider}:${model.id}\n`);

  // 対象ファイルを収集
  const files = collectTargetFiles(options);
  console.log(`対象ファイル: ${files.length}件\n`);

  if (files.length === 0) {
    console.log('対象ファイルがありません。');
    return;
  }

  // 要素を抽出
  const allElements: ElementInfo[] = [];
  for (const file of files) {
    const elements = extractElements(file, options.regenerate);
    allElements.push(...elements);
  }

  const modeLabel = options.regenerate ? '全要素' : 'JSDocなしの要素';
  console.log(`${modeLabel}: ${allElements.length}件\n`);

  if (allElements.length === 0) {
    console.log('処理対象の要素がありません。');
    return;
  }

  // 上限を適用
  const elementsToProcess = allElements.slice(0, options.limit);
  if (elementsToProcess.length < allElements.length) {
    console.log(`上限により ${elementsToProcess.length}/${allElements.length} 件を処理します\n`);
  }

  // 行番号のずれを防ぐため、ファイルごとに行番号の降順でソート
  // （ファイル末尾から処理することで、前の挿入が後の要素の行番号に影響しない）
  elementsToProcess.sort((a, b) => {
    // まずファイルパスでソート
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    // 同じファイル内では行番号の降順
    return b.line - a.line;
  });

  const parallelLimit = resolveJSDocParallelLimit(model, elementsToProcess.length);
  resetParallelLimit();
  currentParallelLimit = parallelLimit;
  const rateLimitKey = buildRateLimitKey(model.provider, model.id);
  console.log(`LLM並列数: ${parallelLimit}`);
  console.log('JSDocを生成中...\n');

  if (options.force && !options.noCache) {
    clearCache();
    console.log('キャッシュをクリアしました (--force)\n');
  }

  const generationResults: GenerationResult[] = [];
  const qualityScores: ElementQualityScore[] = [];
  let cacheHits = 0;
  let batchCalls = 0;
  let individualCalls = 0;

  // 1) キャッシュで解決できるものを先に処理
  const uncachedElements: ElementInfo[] = [];
  for (const element of elementsToProcess) {
    const cached = checkCache(element, model.id, options.force, options.noCache);
    if (!cached) {
      uncachedElements.push(element);
      continue;
    }

    const normalized = validateJsDoc(cached);
    const gate = validateRequiredTags(normalized, element);
    if (!gate.ok) {
      uncachedElements.push(element);
      continue;
    }

    generationResults.push({ element, jsDoc: normalized, fromCache: true });
    cacheHits++;
  }

  // 2) 未キャッシュ要素を生成（バッチ or 個別）
  if (uncachedElements.length > 0) {
    const useBatch = options.batchSize > 1;
    if (useBatch) {
      const batches = chunkArray(uncachedElements, options.batchSize);
      const batchParallelLimit = Math.max(1, Math.min(getCurrentParallelLimit(), batches.length));

      const batchGenerationResults = await runWithConcurrencyLimit(
        batches,
        batchParallelLimit,
        async (batchElements): Promise<GenerationResult[]> => {
          const results: GenerationResult[] = [];
          let batchResult: BatchResult | null = null;

          try {
            batchCalls++;
            batchResult = await retryWithBackoff(
              () => generateJsDocBatch(model, apiKey, batchElements, options),
              {
                rateLimitKey,
                shouldRetry: isRetryableError,
                onRetry: ({ statusCode, error }) => {
                  if (statusCode === 429) {
                    notifyScheduler429(
                      model.provider,
                      model.id,
                      error instanceof Error ? error.message : String(error)
                    );
                    reduceParallelLimit();
                  }
                },
              }
            );
            notifySchedulerSuccess(model.provider, model.id);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (isLikelyRateLimitError(errorMessage)) {
              notifyScheduler429(model.provider, model.id, errorMessage);
              reduceParallelLimit();
            }
          }

          for (const element of batchElements) {
            const elementKey = generateElementKey(element);
            const fromBatch = batchResult?.results.get(elementKey);
            const failedInBatch = batchResult?.failedElementKeys.includes(elementKey) ?? true;

            if (fromBatch && !failedInBatch) {
              const normalized = validateJsDoc(fromBatch);
              const gate = validateRequiredTags(normalized, element);
              if (gate.ok) {
                results.push({ element, jsDoc: normalized });
                continue;
              }
            }

            individualCalls++;
            const fallback = await generateJsDocWithQualityGate(
              model,
              apiKey,
              element,
              options,
              rateLimitKey
            );
            results.push(fallback);
          }

          return results;
        }
      );

      for (const group of batchGenerationResults) {
        generationResults.push(...group);
      }
    } else {
      const individualResults = await runWithConcurrencyLimit(
        uncachedElements,
        getCurrentParallelLimit(),
        async (element): Promise<GenerationResult> => {
          individualCalls++;
          return generateJsDocWithQualityGate(
            model,
            apiKey,
            element,
            options,
            rateLimitKey
          );
        }
      );
      generationResults.push(...individualResults);
    }
  }

  let processed = 0;
  let updated = 0;

  for (const result of generationResults) {
    processed++;
    const { element, jsDoc, errorMessage } = result;
    console.log(`\n[${processed}/${elementsToProcess.length}] ${element.type}: ${element.name}`);
    console.log(`    ${relative(process.cwd(), element.filePath)}:${element.line}`);

    if (errorMessage) {
      console.log(`    エラー: ${errorMessage}`);
      continue;
    }

    if (!jsDoc) {
      console.log(`    JSDocを生成できませんでした`);
      continue;
    }

    const normalizedJsDoc = validateJsDoc(jsDoc);
    const gate = validateRequiredTags(normalizedJsDoc, element);
    if (!gate.ok) {
      console.log(`    必須タグ不足: ${gate.missing.join(', ')}`);
      continue;
    }

    qualityScores.push(calculateQualityScore(normalizedJsDoc, element));

    if (options.dryRun) {
      console.log(`    生成されたJSDoc:\n${normalizedJsDoc.split('\n').map(l => '       ' + l).join('\n')}`);
    } else {
      insertJsDoc(element, normalizedJsDoc);
      if (!result.fromCache && !options.noCache) {
        cacheJsDoc(element, normalizedJsDoc, model.id);
      }
      updated++;
      console.log(`    JSDocを挿入しました`);
    }
  }

  console.log(`\n=== 完了 ===`);
  console.log(`処理: ${processed}件`);
  if (!options.dryRun) {
    console.log(`更新: ${updated}件`);
  }

  if (options.metrics) {
    const metrics = aggregateMetrics(
      generationResults,
      qualityScores,
      startTime,
      cacheHits,
      batchCalls,
      individualCalls
    );
    console.log('\n=== Metrics ===');
    console.log(JSON.stringify(metrics, null, 2));
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function validateRequiredTags(
  jsDoc: string,
  element: ElementInfo
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const content = jsDoc.replace(/^\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '');
  const hasSummary = /@summary\s+\S+/.test(content);
  if (!hasSummary) {
    missing.push('@summary');
  }

  const isFunctionLike = element.type === 'function' || element.type === 'method';
  const signatureParams = element.signature.match(/\(([^)]*)\)/);
  const expectedParamCount = signatureParams
    ? signatureParams[1].split(',').filter(p => p.trim() && !p.includes('...')).length
    : 0;
  const paramMatches = content.match(/@param\s+\S+/g) || [];
  if (isFunctionLike && expectedParamCount > 0 && paramMatches.length < expectedParamCount) {
    missing.push('@param');
  }

  const hasReturns = /@returns?\s+\S+/.test(content);
  const expectsReturns = isFunctionLike &&
    !element.signature.includes(': void') &&
    !element.signature.includes(':void');
  if (expectsReturns && !hasReturns) {
    missing.push('@returns');
  }

  return { ok: missing.length === 0, missing };
}

async function generateJsDocWithQualityGate(
  model: Model,
  apiKey: string,
  element: ElementInfo,
  options: Options,
  rateLimitKey: string
): Promise<GenerationResult> {
  const maxAttempts = 2;
  let lastMissing: string[] = [];
  let lastErrorMessage: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const jsDoc = await retryWithBackoff(
        () => generateJsDocIndividual(model, apiKey, element, options),
        {
          rateLimitKey,
          shouldRetry: isRetryableError,
          onRetry: ({ statusCode, error }) => {
            if (statusCode === 429) {
              notifyScheduler429(
                model.provider,
                model.id,
                error instanceof Error ? error.message : String(error)
              );
              reduceParallelLimit();
            }
          },
        }
      );

      notifySchedulerSuccess(model.provider, model.id);

      if (!jsDoc) {
        lastErrorMessage = 'JSDoc抽出に失敗';
        continue;
      }

      const normalized = validateJsDoc(jsDoc);
      const gate = validateRequiredTags(normalized, element);
      if (gate.ok) {
        return { element, jsDoc: normalized };
      }

      lastMissing = gate.missing;
      lastErrorMessage = `必須タグ不足: ${gate.missing.join(', ')}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastErrorMessage = errorMessage;
      if (isLikelyRateLimitError(errorMessage)) {
        notifyScheduler429(model.provider, model.id, errorMessage);
        reduceParallelLimit();
      }
    }
  }

  return {
    element,
    jsDoc: null,
    errorMessage: lastMissing.length > 0
      ? `品質ゲート失敗 (${lastMissing.join(', ')})`
      : lastErrorMessage ?? 'JSDocを生成できませんでした',
  };
}

/**
 * JSDoc生成の並列数を決定する
 * 優先順位: 環境変数 > モデル設定 > デフォルト値
 *
 * @param model 使用するモデル
 * @param taskCount タスク数
 * @returns 並列数
 */
function resolveJSDocParallelLimit(model: Model, taskCount: number): number {
  // 環境変数で上書き（最優先）
  const envLimit = process.env.JSDOC_MAX_PARALLEL;
  if (envLimit) {
    const parsed = parseInt(envLimit, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(Math.max(parsed, MIN_PARALLEL_LIMIT), MAX_PARALLEL_LIMIT);
    }
  }

  // モデルの設定値を取得
  const modelParallelLimit = model.maxParallelGenerations || DEFAULT_PARALLEL_LIMIT;

  // タスク数と上限を考慮
  return Math.min(
    Math.max(modelParallelLimit, DEFAULT_PARALLEL_LIMIT),
    taskCount,
    MAX_PARALLEL_LIMIT
  );
}

/** 現在の並列数（429エラー時に動的調整用） */
let currentParallelLimit: number | null = null;

/**
 * 現在の並列数を取得（429エラー時の動的調整を反映）
 */
function getCurrentParallelLimit(): number {
  return currentParallelLimit ?? DEFAULT_PARALLEL_LIMIT;
}

/**
 * 429エラー時に並列数を低下させる
 */
function reduceParallelLimit(): void {
  const current = getCurrentParallelLimit();
  const reduced = Math.max(MIN_PARALLEL_LIMIT, Math.floor(current / 2));
  currentParallelLimit = reduced;
  console.log(`    並列数を ${current} -> ${reduced} に低下しました`);
}

/**
 * 並列数をリセット
 */
function resetParallelLimit(): void {
  currentParallelLimit = null;
}

function isLikelyRateLimitError(message: string): boolean {
  return /429|rate\s*limit|too many requests/i.test(message);
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(args: string[]): Options {
  const options: Options = {
    dryRun: false,
    check: false,
    verbose: false,
    limit: 50,
    file: undefined,
    regenerate: false,
    batchSize: DEFAULT_BATCH_SIZE,
    force: false,
    noCache: false,
    metrics: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--check':
        options.check = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10) || 50;
        break;
      case '--file':
        options.file = args[++i];
        break;
      case '--regenerate':
      case '--all':
        options.regenerate = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        if (isNaN(options.batchSize)) options.batchSize = DEFAULT_BATCH_SIZE;
        break;
      case '--force':
        options.force = true;
        break;
      case '--no-cache':
        options.noCache = true;
        break;
      case '--metrics':
        options.metrics = true;
        break;
    }
  }

  return options;
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * キャッシュディレクトリを初期化する
 */
function initCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * ファイル内容のSHA256ハッシュを計算する
 */
function calculateFileHash(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8');
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 要素の一意キーを生成する
 */
function generateElementKey(element: ElementInfo): string {
  // ファイルパス + 行番号 + 名前 で一意識別
  const key = `${element.filePath}:${element.line}:${element.name}`;
  return createHash('sha256').update(key).digest('hex').substring(0, 16);
}

/**
 * キャッシュファイルのパスを取得する
 */
function getCachePath(elementKey: string): string {
  return join(CACHE_DIR, `${elementKey}.json`);
}

/**
 * キャッシュからエントリを読み込む
 */
function loadCacheEntry(elementKey: string): CacheEntry | null {
  const cachePath = getCachePath(elementKey);
  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    return JSON.parse(content) as CacheEntry;
  } catch {
    return null;
  }
}

/**
 * キャッシュにエントリを保存する
 */
function saveCacheEntry(entry: CacheEntry): void {
  initCacheDir();
  const cachePath = getCachePath(entry.elementKey);
  writeFileSync(cachePath, JSON.stringify(entry, null, 2), 'utf-8');
}

/**
 * キャッシュ全体をクリアする
 */
function clearCache(): void {
  if (existsSync(CACHE_DIR)) {
    rmSync(CACHE_DIR, { recursive: true, force: true });
  }
}

/**
 * 要素のキャッシュをチェックし、有効ならJSDocを返す
 */
function checkCache(
  element: ElementInfo,
  modelId: string,
  force: boolean,
  noCache: boolean
): string | null {
  if (noCache || force) {
    return null;
  }

  const elementKey = generateElementKey(element);
  const entry = loadCacheEntry(elementKey);

  if (!entry) {
    return null;
  }

  // モデルが異なる場合は無効
  if (entry.modelId !== modelId) {
    return null;
  }

  // ファイルハッシュが異なる場合は無効
  const currentHash = calculateFileHash(element.filePath);
  if (entry.fileHash !== currentHash) {
    return null;
  }

  return entry.jsDoc;
}

/**
 * 要素のJSDocをキャッシュに保存する
 */
function cacheJsDoc(
  element: ElementInfo,
  jsDoc: string,
  modelId: string
): void {
  const elementKey = generateElementKey(element);
  const fileHash = calculateFileHash(element.filePath);

  saveCacheEntry({
    elementKey,
    jsDoc,
    fileHash,
    createdAt: Date.now(),
    modelId,
  });
}

// ============================================================================
// Quality Metrics
// ============================================================================

/**
 * JSDocの品質スコアを計算する
 */
function calculateQualityScore(jsDoc: string, element: ElementInfo): ElementQualityScore {
  const lines = jsDoc.split('\n');
  const content = jsDoc.replace(/^\/\*\*|\*\/$/g, '').replace(/^\s*\*\s?/gm, '');

  // @paramの数をカウント
  const paramMatches = content.match(/@param\s+\S+/g) || [];
  const paramCount = paramMatches.length;

  // 期待される@param数を推定（シグネチャから）
  const signatureParams = element.signature.match(/\(([^)]*)\)/);
  const expectedParamCount = signatureParams
    ? signatureParams[1].split(',').filter(p => p.trim() && !p.includes('...')).length
    : 0;

  // @returnsの有無
  const hasReturns = /@returns?/.test(content);

  // @returnsが期待されるか（関数・メソッドで戻り値がvoidでない）
  const expectsReturns = (element.type === 'function' || element.type === 'method') &&
    !element.signature.includes(': void') &&
    !element.signature.includes(':void');

  // スコア計算（0-100）
  let score = 50; // ベーススコア

  // 要約行がある (+10)
  const summaryLine = lines.find(l => l.trim() && !l.trim().startsWith('* @'));
  if (summaryLine && summaryLine.length > 5) {
    score += 10;
  }

  // @paramカバレッジ (+20)
  if (expectedParamCount > 0) {
    const paramCoverageRatio = Math.min(paramCount / expectedParamCount, 1);
    score += Math.floor(20 * paramCoverageRatio);
  } else if (paramCount === 0) {
    score += 10; // パラメータなしの場合
  }

  // @returns (+20)
  if (expectsReturns) {
    if (hasReturns) score += 20;
  } else {
    score += 10; // 戻り値なしの場合
  }

  return {
    elementName: element.name,
    elementType: element.type,
    score: Math.min(100, score),
    paramCount,
    expectedParamCount,
    hasReturns,
    expectsReturns,
  };
}

/**
 * メトリクスを集計する
 */
function aggregateMetrics(
  results: GenerationResult[],
  qualityScores: ElementQualityScore[],
  startTime: number,
  cacheHits: number,
  batchCalls: number,
  individualCalls: number
): QualityMetrics {
  const succeeded = results.filter(r => r.jsDoc !== null);
  const errors = results.filter(r => r.errorMessage);

  // 平均品質スコア
  const avgScore = qualityScores.length > 0
    ? qualityScores.reduce((sum, s) => sum + s.score, 0) / qualityScores.length
    : 0;

  // @paramカバレッジ
  const elementsWithParams = qualityScores.filter(s => s.expectedParamCount > 0);
  const paramCoverage = elementsWithParams.length > 0
    ? elementsWithParams.filter(s => s.paramCount >= s.expectedParamCount).length /
      elementsWithParams.length * 100
    : 100;

  // @returnsカバレッジ
  const elementsWithReturns = qualityScores.filter(s => s.expectsReturns);
  const returnsCoverage = elementsWithReturns.length > 0
    ? elementsWithReturns.filter(s => s.hasReturns).length /
      elementsWithReturns.length * 100
    : 100;

  // 一意なファイル数
  const uniqueFiles = new Set(results.map(r => r.element.filePath));

  return {
    filesProcessed: uniqueFiles.size,
    elementsProcessed: results.length,
    elementsSucceeded: succeeded.length,
    cacheHits,
    batchCalls,
    individualCalls,
    averageQualityScore: Math.round(avgScore * 100) / 100,
    paramCoverage: Math.round(paramCoverage * 100) / 100,
    returnsCoverage: Math.round(returnsCoverage * 100) / 100,
    processingTimeMs: Date.now() - startTime,
    errorCount: errors.length,
  };
}

// ============================================================================
// Check Mode
// ============================================================================

async function checkMode(options: Options) {
  const files = collectTargetFiles(options);
  const allElements: ElementInfo[] = [];

  for (const file of files) {
    const elements = extractElements(file, options.regenerate);
    allElements.push(...elements);
  }

  const modeLabel = options.regenerate ? '全要素' : 'JSDocなしの要素';
  console.log(`${modeLabel}: ${allElements.length}件\n`);

  if (allElements.length > 0) {
    const byType: Record<string, number> = {};
    for (const el of allElements) {
      byType[el.type] = (byType[el.type] || 0) + 1;
    }

    console.log('タイプ別:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}件`);
    }

    process.exit(1);
  }

  process.exit(0);
}

// ============================================================================
// pi SDK Initialization
// ============================================================================

async function initializePiSdk(): Promise<{
  model: Model | null;
  apiKey: string | null;
}> {
  // 設定ファイルから読み込み
  const piDir = join(homedir(), '.pi', 'agent');
  const settingsPath = join(piDir, 'settings.json');
  const authPath = join(piDir, 'auth.json');

  let provider = 'anthropic';
  let modelId = 'claude-sonnet-4-20250514';

  try {
    const settingsContent = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsContent);
    provider = settings.defaultProvider || provider;
    modelId = settings.defaultModel || modelId;
  } catch (error) {
    console.warn('設定ファイルの読み込みに失敗しました、デフォルト値を使用します');
  }

  // モデルIDを変換（zai.glm-4.7のような形式）
  let modelKey = `${provider}.${modelId}`;

  // モデルを取得
  let model = getModel(provider, modelId);

  // 見つからない場合、完全なキー形式で再試行
  if (!model) {
    model = getModel(provider, modelKey);
  }

  if (!model) {
    console.error(`モデルが見つかりません: ${provider}:${modelId}`);
    return { model: null, apiKey: null };
  }

  // APIキーを取得
  let apiKey: string | null = null;
  try {
    const authContent = readFileSync(authPath, 'utf-8');
    const auth = JSON.parse(authContent);

    if (auth[provider] && auth[provider].type === 'api_key') {
      apiKey = auth[provider].key;
    } else {
      console.error(`APIキーが見つかりません: ${provider}`);
    }
  } catch (error) {
    console.error('認証ファイルの読み込みに失敗しました');
  }

  return { model, apiKey };
}

// ============================================================================
// File Collection
// ============================================================================

function collectTargetFiles(options: Options): string[] {
  const rootDir = join(__dirname, '..');
  const extensionsDir = join(rootDir, '.pi/extensions');
  const libDir = join(rootDir, '.pi/lib');

  const files: string[] = [];

  if (options.file) {
    const absPath = options.file.startsWith('/')
      ? options.file
      : join(rootDir, options.file);
    if (existsSync(absPath)) {
      files.push(absPath);
    }
    return files;
  }

  files.push(...collectTypeScriptFiles(extensionsDir));
  files.push(...collectTypeScriptFiles(libDir));

  return files;
}

function collectTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  function walk(path: string) {
    const entries = readdirSync(path);
    for (const entry of entries) {
      const fullPath = join(path, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
        walk(fullPath);
      } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts') && !entry.endsWith('.test.ts')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// ============================================================================
// Element Extraction
// ============================================================================

function extractElements(filePath: string, regenerate: boolean): ElementInfo[] {
  const sourceCode = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const elements: ElementInfo[] = [];
  const lines = sourceCode.split('\n');

  function visit(node: ts.Node) {
    // 関数宣言
    if (ts.isFunctionDeclaration(node) && node.name) {
      const jsDocInfo = getJsDocInfo(node, sourceFile);
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

      if (isExported && shouldProcessElement(jsDocInfo, regenerate)) {
        const name = node.name.getText(sourceFile);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const params = Array.from(node.parameters).map(p => {
          const paramName = p.name.getText(sourceFile);
          const paramType = p.type?.getText(sourceFile) || 'any';
          const optional = p.questionToken !== undefined;
          return `${paramName}${optional ? '?' : ''}: ${paramType}`;
        }).join(', ');
        const returnType = node.type?.getText(sourceFile) || 'void';
        const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
        const signature = `${isAsync ? 'async ' : ''}function ${name}(${params}): ${returnType}`;

        elements.push({
          type: 'function',
          name,
          line,
          signature,
          context: getContext(lines, line - 1, 10),
          filePath,
          existingJsDocRange: jsDocInfo?.range,
        });
      }
    }

    // 矢印関数を含む変数宣言
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        const func = node.initializer;
        const varStmt = node.parent?.parent;
        const isExported = varStmt && ts.isVariableStatement(varStmt) &&
          (varStmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);

        if (isExported && varStmt && ts.isVariableStatement(varStmt)) {
          const jsDocInfo = getJsDocInfo(varStmt, sourceFile);

          if (shouldProcessElement(jsDocInfo, regenerate)) {
            const name = node.name.getText(sourceFile);
            const line = sourceFile.getLineAndCharacterOfPosition(varStmt.getStart(sourceFile)).line + 1;
            const params = Array.from(func.parameters).map(p => {
              const paramName = p.name.getText(sourceFile);
              const paramType = p.type?.getText(sourceFile) || 'any';
              const optional = p.questionToken !== undefined;
              return `${paramName}${optional ? '?' : ''}: ${paramType}`;
            }).join(', ');
            const returnType = func.type?.getText(sourceFile) || 'void';
            const isAsync = func.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
            const signature = `${isAsync ? 'async ' : ''}const ${name} = (${params}): ${returnType}`;

            elements.push({
              type: 'function',
              name,
              line,
              signature,
              context: getContext(lines, line - 1, 10),
              filePath,
              existingJsDocRange: jsDocInfo?.range,
            });
          }
        }
      }
    }

    // クラス
    if (ts.isClassDeclaration(node) && node.name) {
      const jsDocInfo = getJsDocInfo(node, sourceFile);
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

      if (isExported && shouldProcessElement(jsDocInfo, regenerate)) {
        const name = node.name.getText(sourceFile);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const methods = Array.from(node.members)
          .filter(ts.isMethodDeclaration)
          .map(m => m.name.getText(sourceFile))
          .slice(0, 5)
          .join(', ');
        const signature = `class ${name} { ${methods}... }`;

        elements.push({
          type: 'class',
          name,
          line,
          signature,
          context: getContext(lines, line - 1, 20),
          filePath,
          existingJsDocRange: jsDocInfo?.range,
        });
      }

      // クラスメソッド（publicのみ）
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member)) {
          const methodJsDocInfo = getJsDocInfo(member, sourceFile);
          const isPrivate = member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ?? false;
          const isProtected = member.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword) ?? false;

          if (!isPrivate && !isProtected && shouldProcessElement(methodJsDocInfo, regenerate)) {
            const methodName = member.name.getText(sourceFile);
            const methodLine = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1;
            const params = Array.from(member.parameters).map(p => p.name.getText(sourceFile)).join(', ');
            const ret = member.type?.getText(sourceFile) || 'void';
            const signature = `${methodName}(${params}): ${ret}`;

            elements.push({
              type: 'method',
              name: `${node.name!.getText(sourceFile)}.${methodName}`,
              line: methodLine,
              signature,
              context: getContext(lines, methodLine - 1, 10),
              filePath,
              existingJsDocRange: methodJsDocInfo?.range,
            });
          }
        }
      }
    }

    // インターフェース
    if (ts.isInterfaceDeclaration(node)) {
      const jsDocInfo = getJsDocInfo(node, sourceFile);
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

      if (isExported && shouldProcessElement(jsDocInfo, regenerate)) {
        const name = node.name.getText(sourceFile);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const props = Array.from(node.members)
          .filter(ts.isPropertySignature)
          .map(m => m.name.getText(sourceFile))
          .slice(0, 5)
          .join(', ');
        const signature = `interface ${name} { ${props}... }`;

        elements.push({
          type: 'interface',
          name,
          line,
          signature,
          context: getContext(lines, line - 1, 15),
          filePath,
          existingJsDocRange: jsDocInfo?.range,
        });
      }
    }

    // 型エイリアス
    if (ts.isTypeAliasDeclaration(node)) {
      const jsDocInfo = getJsDocInfo(node, sourceFile);
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

      if (isExported && shouldProcessElement(jsDocInfo, regenerate)) {
        const name = node.name.getText(sourceFile);
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const definition = node.type?.getText(sourceFile) || '';
        const signature = `type ${name} = ${definition.substring(0, 50)}${definition.length > 50 ? '...' : ''}`;

        elements.push({
          type: 'type',
          name,
          line,
          signature,
          context: getContext(lines, line - 1, 10),
          filePath,
          existingJsDocRange: jsDocInfo?.range,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return elements;
}

/**
 * 対象ノードに紐づくJSDocの行範囲を取得
 */
function getJsDocInfo(node: ts.Node, sourceFile: ts.SourceFile): { range: JsDocRange } | undefined {
  const jsDocNode = ts.getJSDocCommentsAndTags(node).find(ts.isJSDoc);
  if (!jsDocNode) {
    return undefined;
  }

  const start = jsDocNode.getStart(sourceFile);
  const end = jsDocNode.getEnd();

  return {
    range: {
      startLine: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
      endLine: sourceFile.getLineAndCharacterOfPosition(end).line + 1,
    },
  };
}

function shouldProcessElement(jsDocInfo: { range: JsDocRange } | undefined, regenerate: boolean): boolean {
  return regenerate || !jsDocInfo;
}

function getContext(lines: string[], startLine: number, contextLines: number): string {
  const start = Math.max(0, startLine - contextLines);
  const end = Math.min(lines.length, startLine + contextLines + 1);
  return lines.slice(start, end).join('\n');
}

// ============================================================================
// JSDoc Generation with streamSimple (pi recommended approach)
// ============================================================================

/**
 * streamSimpleを使用してJSDocを生成（pi推奨のLLM呼び出し方法）
 */
async function generateJsDocWithStreamSimple(
  model: Model,
  apiKey: string,
  element: ElementInfo,
  options: Options
): Promise<string | null> {
  const prompt = buildPrompt(element);

  if (options.verbose) {
    console.log(`\n    [Prompt]\n${prompt.split('\n').map(l => '       ' + l).join('\n')}`);
  }

  // Contextを作成
  const context: Context = {
    messages: [
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ],
    systemPrompt: getJsDocSystemPrompt('single'),
  };

  // streamSimpleでLLMを呼び出し（pi推奨の方法）
  const eventStream = streamSimple(model, context, { apiKey });

  let response = '';

  // タイムアウト付きでasync iteratorでイベントを収集
  const timeoutMs = DEFAULT_LLM_TIMEOUT_MS;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`LLM timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const streamPromise = (async () => {
    for await (const event of eventStream) {
      if (event.type === 'text_delta') {
        response += event.delta;
      }
      if (event.type === 'error') {
        throw new Error(`LLM error: ${JSON.stringify(event)}`);
      }
    }
    return response;
  })();

  await Promise.race([streamPromise, timeoutPromise]);

  return extractJsDocFromResponse(response);
}

function buildPrompt(element: ElementInfo): string {
  // プロンプト圧縮版: 共有コンテキストを分離し、トークン数を約60%削減
  return `# JSDoc生成
種別: ${element.type}
名前: ${element.name}
シグネチャ: ${element.signature}

## コード
\`\`\`ts
${element.context}
\`\`\`

要件:
- 日本語で記述
- 要約50字以内
- @summary は20字以内（シーケンス図用）
- 必須: @summary, @param, @returns
- 条件付き: @throws（例外を投げる場合）, @deprecated（非推奨の場合）
- イベント駆動のみ: @fires, @listens
- 出力はJSDocのみ`;
}

/**
 * 圧縮されたバッチ用プロンプトを構築する
 * 複数要素を1回のLLM呼び出しで処理するためのプロンプト
 */
function buildBatchPrompt(elements: ElementInfo[]): string {
  // 共有コンテキスト（ファイル情報）を1回だけ記述
  const filePaths = [...new Set(elements.map(e => relative(process.cwd(), e.filePath)))];
  const sharedContext = filePaths.length === 1
    ? `ファイル: ${filePaths[0]}`
    : `ファイル: ${filePaths.length}件`;

  // 各要素の簡潔な情報
  const elementList = elements.map((e, i) => {
    const contextPreview = e.context.split('\n').slice(0, 5).join('\n');
    return `[${i + 1}] ${e.type} ${e.name}
シグネチャ: ${e.signature}
\`\`\`ts
${contextPreview}
...
\`\`\``;
  }).join('\n\n');

  return `# バッチJSDoc生成
${sharedContext}

## 要素 (${elements.length}件)
${elementList}

## 出力形式
各要素のJSDocを以下の区切り文字で区切って出力:
${BATCH_DELIMITER}

要件:
- 日本語で記述
- 要約50字以内
- @summary は20字以内（シーケンス図用）
- 必須: @summary, @param, @returns
- 条件付き: @throws（例外を投げる場合）, @deprecated（非推奨の場合）
- イベント駆動のみ: @fires, @listens`;
}

/**
 * バッチLLM呼び出しで複数要素のJSDocを生成する
 * 失敗時は個別処理にフォールバック
 */
async function generateJsDocBatch(
  model: Model,
  apiKey: string,
  elements: ElementInfo[],
  options: Options
): Promise<BatchResult> {
  const results = new Map<string, string | null>();
  const failedElementKeys: string[] = [];

  if (elements.length === 0) {
    return { results, failedElementKeys };
  }

  const prompt = buildBatchPrompt(elements);

  if (options.verbose) {
    console.log(`\n    [Batch Prompt for ${elements.length} elements]\n${prompt.split('\n').map(l => '       ' + l).join('\n')}`);
  }

  try {
    const context: Context = {
      messages: [
        { role: 'user', content: [{ type: 'text', text: prompt }] }
      ],
      systemPrompt: getJsDocSystemPrompt('batch'),
    };

    const eventStream = streamSimple(model, context, { apiKey });
    let response = '';

    // バッチは要素数に応じてタイムアウトを延長（最大180秒）
    const batchTimeoutMs = Math.min(DEFAULT_LLM_TIMEOUT_MS * elements.length, 180000);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`LLM batch timeout after ${batchTimeoutMs}ms`)), batchTimeoutMs);
    });

    const streamPromise = (async () => {
      for await (const event of eventStream) {
        if (event.type === 'text_delta') {
          response += event.delta;
        }
        if (event.type === 'error') {
          throw new Error(`LLM error: ${JSON.stringify(event)}`);
        }
      }
      return response;
    })();

    await Promise.race([streamPromise, timeoutPromise]);

    // 区切り文字で分割して各JSDocを抽出
    const parts = response.split(BATCH_DELIMITER);

    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const elementKey = generateElementKey(element);
      const part = parts[i]?.trim() || '';
      const jsDoc = extractJsDocFromResponse(part);

      if (jsDoc) {
        results.set(elementKey, jsDoc);
      } else {
        failedElementKeys.push(elementKey);
      }
    }

    // バッチ数よりJSDocが少ない場合、残りを失敗としてマーク
    for (let i = parts.length; i < elements.length; i++) {
      failedElementKeys.push(generateElementKey(elements[i]));
    }

  } catch (error) {
    // バッチ全体が失敗した場合、全要素を個別処理対象に
    for (const element of elements) {
      failedElementKeys.push(generateElementKey(element));
    }

    if (options.verbose) {
      console.log(`    バッチ処理失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { results, failedElementKeys };
}

/**
 * 個別のJSDoc生成（バッチフォールバック用）
 */
async function generateJsDocIndividual(
  model: Model,
  apiKey: string,
  element: ElementInfo,
  options: Options
): Promise<string | null> {
  const prompt = buildPrompt(element);

  if (options.verbose) {
    console.log(`\n    [Prompt]\n${prompt.split('\n').map(l => '       ' + l).join('\n')}`);
  }

  const context: Context = {
    messages: [
      { role: 'user', content: [{ type: 'text', text: prompt }] }
    ],
    systemPrompt: getJsDocSystemPrompt('single'),
  };

  const eventStream = streamSimple(model, context, { apiKey });

  let response = '';

  // タイムアウト付きでasync iteratorでイベントを収集
  const timeoutMs = DEFAULT_LLM_TIMEOUT_MS;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`LLM timeout after ${timeoutMs}ms`)), timeoutMs);
  });

  const streamPromise = (async () => {
    for await (const event of eventStream) {
      if (event.type === 'text_delta') {
        response += event.delta;
      }
      if (event.type === 'error') {
        throw new Error(`LLM error: ${JSON.stringify(event)}`);
      }
    }
    return response;
  })();

  await Promise.race([streamPromise, timeoutPromise]);

  return extractJsDocFromResponse(response);
}

function extractJsDocFromResponse(response: string): string | null {
  // 最初の完全なJSDocブロックを抽出（ネストを許容しない）
  // JSDocで始まり、途中にJSDocを含まず、終了タグで終わるブロック
  const lines = response.split('\n');
  const jsDocLines: string[] = [];
  let inJsDoc = false;
  let foundStart = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // JSDoc開始を検出
    if (!inJsDoc && trimmed.startsWith('/**')) {
      // 行内で完結するJSDoc（例: /** short */）
      if (trimmed.endsWith('*/') && trimmed.indexOf('*/') === trimmed.lastIndexOf('*/')) {
        return trimmed;
      }
      inJsDoc = true;
      foundStart = true;
      jsDocLines.push(line);
      continue;
    }
    
    // JSDoc内の処理
    if (inJsDoc) {
      // ネストしたJSDoc開始は無効（スキップ）
      if (trimmed.startsWith('/**')) {
        // ネスト検出：リセット
        jsDocLines.length = 0;
        inJsDoc = false;
        continue;
      }
      
      jsDocLines.push(line);
      
      // JSDoc終了を検出
      if (trimmed.endsWith('*/')) {
        break;
      }
    }
  }

  if (jsDocLines.length > 0 && foundStart) {
    const jsDoc = jsDocLines.join('\n').trim();
    // 最小限のバリデーション
    if (jsDoc.startsWith('/**') && jsDoc.endsWith('*/')) {
      return jsDoc;
    }
  }

  // コードブロックから抽出を試みる
  const codeBlockMatch = response.match(/```(?:typescript|javascript)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    return extractJsDocFromResponse(codeBlockMatch[1]);
  }

  return null;
}

/**
 * LLMのばらついたJSDoc出力を、安定した複数行フォーマットに正規化する
 */
function normalizeJsDoc(jsDoc: string): string {
  const trimmed = jsDoc.trim();
  if (!trimmed.startsWith('/**') || !trimmed.endsWith('*/')) {
    return jsDoc;
  }

  // 1行JSDoc（/** ... */）を含め、常に複数行形式へ統一
  let body = trimmed
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .trim();

  // 行頭の`*`は一旦取り除き、統一フォーマットで再構築する
  const bodyLines = body.length > 0
    ? body
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^\*\s?/, '').trim())
    : [];

  const normalizedLines = [
    '/**',
    ...(bodyLines.length > 0
      ? bodyLines.map(line => line.length > 0 ? ` * ${line}` : ' *')
      : [' *']),
    ' */',
  ];

  return normalizedLines.join('\n');
}

// ============================================================================
// JSDoc Insertion
// ============================================================================

/**
 * 既存のJSDocを正確に削除する
 * 行単位でJSDocから始まり終了タグで終わるブロックを削除する
 */
function removeExistingJsDoc(lines: string[], element: ElementInfo): { lines: string[]; insertIndex: number } {
  let insertIndex = element.line - 1;

  if (!element.existingJsDocRange) {
    return { lines, insertIndex };
  }

  // 削除範囲を特定（JSDocの開始行から終了行まで）
  const deleteStart = element.existingJsDocRange.startLine - 1;
  let deleteEnd = element.existingJsDocRange.endLine - 1;

  // 終了行の後ろにある空行も削除範囲に含める
  let extendedEnd = deleteEnd + 1;
  while (extendedEnd < lines.length && lines[extendedEnd].trim() === '') {
    extendedEnd++;
  }
  // 空行が1つだけの場合は削除、複数ある場合は最初の1つだけ残す
  if (extendedEnd > deleteEnd + 1) {
    deleteEnd = extendedEnd - 2; // 最後の空行は残す
  }

  // JSDocブロックを正確に削除（+1 で終了行を含める）
  const deleteCount = deleteEnd - deleteStart + 1;
  if (deleteCount > 0) {
    lines.splice(deleteStart, deleteCount);
    insertIndex = deleteStart;
  }

  return { lines, insertIndex };
}

/**
 * 生成されたJSDocに重複する終了タグがないか検証
 */
function validateJsDoc(jsDoc: string): string {
  const normalized = normalizeJsDoc(jsDoc);
  const lines = normalized.split('\n');

  // 終了タグが重複していないかチェック
  let endTagCount = 0;
  for (const line of lines) {
    if (line.trim().endsWith('*/')) {
      endTagCount++;
      // 重複検出：同じ行に複数の終了タグがあれば後続を削除
      const match = line.match(new RegExp("\\*/", "g"));
      if (match && match.length > 1) {
        // 最初の終了タグのみを残す
        const firstIndex = line.indexOf('*/');
        const cleaned = line.substring(0, firstIndex + 2) + line.substring(firstIndex + 2).replace(new RegExp("\\*/", "g"), '').trim();
        return lines.map(l => l === line ? cleaned : l).join('\n');
      }
    }
  }

  // 複数の行に終了タグがある場合、最初のみを残す
  if (endTagCount > 1) {
    let seenEndTag = false;
    const cleanedLines = lines.map(line => {
      if (line.trim().endsWith('*/')) {
        if (seenEndTag) {
          // 2番目以降の終了タグ行は削除
          return '';
        }
        seenEndTag = true;
      }
      return line;
    }).filter(l => l !== '');
    return cleanedLines.join('\n');
  }

  return normalized;
}

function insertJsDoc(element: ElementInfo, jsDoc: string): void {
  const sourceCode = readFileSync(element.filePath, 'utf-8');
  let lines = sourceCode.split('\n');

  // 既存のJSDocを削除
  const result = removeExistingJsDoc(lines, element);
  lines = result.lines;
  let insertIndex = result.insertIndex;

  // JSDocを検証
  jsDoc = validateJsDoc(jsDoc);

  // 置換後の挿入位置を基準にインデントを決める
  const targetLine = lines[insertIndex] ?? '';
  const indentMatch = targetLine.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';

  // 挿入位置の直前に孤立した「*/」がないか確認して削除
  if (insertIndex > 0) {
    const prevLine = lines[insertIndex - 1];
    if (prevLine && prevLine.trim() === '*/') {
      lines.splice(insertIndex - 1, 1);
      insertIndex--;
    } else if (prevLine && prevLine.trim().endsWith('*/') && !prevLine.trim().startsWith('/**')) {
      // 行の末尾に孤立した「*/」がある場合、その部分を削除
      const lastEndTagIndex = prevLine.lastIndexOf('*/');
      lines[insertIndex - 1] = prevLine.substring(0, lastEndTagIndex).trimEnd();
    }
  }

  // JSDocを整形してインデントを付与
  const indentedJsDocLines = jsDoc
    .split('\n')
    .map(line => indent + line);

  // JSDocを行単位で挿入
  lines.splice(insertIndex, 0, ...indentedJsDocLines);

  // 挿入後に重複する「*/」がないか確認してクリーンアップ
  const newJsDocEndLine = insertIndex + indentedJsDocLines.length;
  if (newJsDocEndLine < lines.length) {
    const nextLine = lines[newJsDocEndLine];
    if (nextLine && nextLine.trim() === '*/') {
      lines.splice(newJsDocEndLine, 1);
    }
  }

  // ファイルに書き戻し
  writeFileSync(element.filePath, lines.join('\n'), 'utf-8');
}

// ============================================================================
// Run
// ============================================================================

main().catch((error) => {
  console.error('エラー:', error);
  process.exit(1);
});
