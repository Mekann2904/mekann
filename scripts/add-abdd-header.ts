#!/usr/bin/env npx tsx
/**
 * Path: scripts/add-abdd-header.ts
 * Role: ABDD用の構造化ファイルヘッダーコメントをLLMで生成して挿入するスクリプト。
 * Why: 人間向け説明と機械抽出可能なメタデータをコード先頭に統一するため。
 * Related: scripts/add-jsdoc.ts, .pi/APPEND_SYSTEM.md, scripts/generate-abdd.ts, ABDD/spec.md
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join, relative, dirname } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { streamSimple, getModel, type Context } from '@mariozechner/pi-ai';
import type { Model } from '@mariozechner/pi-ai';

import { runWithConcurrencyLimit } from '../.pi/lib/concurrency';
import { retryWithBackoff, isRetryableError } from '../.pi/lib/retry-with-backoff';
import { buildRateLimitKey } from '../.pi/lib/runtime-utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Constants
// ============================================================================

const CACHE_DIR = join(homedir(), '.pi', 'cache', 'abdd-header');
const DEFAULT_PARALLEL_LIMIT = 6;
const MIN_PARALLEL_LIMIT = 1;
const MAX_PARALLEL_LIMIT = 12;
const MAX_CONTEXT_LINES = 120;
/** LLM呼び出しのデフォルトタイムアウト（ミリ秒） */
const DEFAULT_LLM_TIMEOUT_MS = 60000; // 60秒
const APPEND_SYSTEM_PATH = join(__dirname, '..', '.pi', 'APPEND_SYSTEM.md');
const HEADER_PROMPT_START = '<!-- ABDD_FILE_HEADER_PROMPT_START -->';
const HEADER_PROMPT_END = '<!-- ABDD_FILE_HEADER_PROMPT_END -->';
const HEADER_PROMPT_FALLBACK = [
  'あなたはTypeScriptファイル用のABDDヘッダー生成アシスタントです。',
  '出力はコメントブロックのみ（/** ... */）にしてください。',
  '必須構造:',
  '- @abdd.meta',
  '- path, role, why, related, public_api, invariants, side_effects, failure_modes',
  '- @abdd.explain',
  '- overview, what_it_does, why_it_exists, scope(in/out)',
  '要件:',
  '- 日本語で簡潔に記述する',
  '- コードと矛盾する内容を書かない',
  '- 曖昧語（適切に処理する、必要に応じて 等）を避ける',
  '- related は2〜4件',
].join('\n');

// ============================================================================
// Types
// ============================================================================

interface FileInfo {
  filePath: string;
  relativePath: string;
  context: string;
  existingHeaderRange?: { startLine: number; endLine: number };
}

interface GenerationResult {
  file: FileInfo;
  header: string | null;
  errorMessage?: string;
}

interface CacheEntry {
  fileKey: string;
  header: string;
  fileHash: string;
  createdAt: number;
  modelId: string;
}

interface Options {
  dryRun: boolean;
  check: boolean;
  verbose: boolean;
  limit: number;
  file?: string;
  regenerate: boolean;
  force: boolean;
  noCache: boolean;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('=== ABDDヘッダー生成スクリプト ===\n');

  if (options.check) {
    await checkMode(options);
    return;
  }

  if (options.dryRun) {
    console.log('ドライランモード: 変更は適用されません\n');
  }

  const { model, apiKey } = await initializePiSdk();
  if (!model || !apiKey) {
    console.error('モデルまたはAPIキーの初期化に失敗しました');
    process.exit(1);
  }
  console.log(`モデル: ${model.provider}:${model.id}\n`);

  const files = collectTargetFiles(options);
  console.log(`対象ファイル: ${files.length}件\n`);
  if (files.length === 0) {
    console.log('対象ファイルがありません。');
    return;
  }

  const allTargets: FileInfo[] = [];
  for (const file of files) {
    const info = buildFileInfo(file);
    if (shouldProcessFile(info, options.regenerate)) {
      allTargets.push(info);
    }
  }

  const modeLabel = options.regenerate ? '全ファイル' : 'ヘッダー未設定ファイル';
  console.log(`${modeLabel}: ${allTargets.length}件\n`);
  if (allTargets.length === 0) {
    console.log('処理対象がありません。');
    return;
  }

  const targets = allTargets.slice(0, options.limit);
  if (targets.length < allTargets.length) {
    console.log(`上限により ${targets.length}/${allTargets.length} 件を処理します\n`);
  }

  const parallelLimit = resolveParallelLimit(targets.length);
  const rateLimitKey = buildRateLimitKey(model.provider, model.id);
  console.log(`LLM並列数: ${parallelLimit}`);
  console.log('ヘッダーを生成中...\n');

  const results = await runWithConcurrencyLimit(
    targets,
    parallelLimit,
    async (file): Promise<GenerationResult> => {
      try {
        const cached = checkCache(file, model.id, options.force, options.noCache);
        if (cached) {
          return { file, header: cached };
        }

        const header = await retryWithBackoff(
          () => generateHeader(model, apiKey, file, options),
          { rateLimitKey, shouldRetry: isRetryableError }
        );

        if (header && !options.noCache) {
          cacheHeader(file, header, model.id);
        }

        return { file, header };
      } catch (error) {
        return {
          file,
          header: null,
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );

  let processed = 0;
  let updated = 0;

  for (const result of results) {
    processed++;
    const { file, header, errorMessage } = result;
    console.log(`\n[${processed}/${targets.length}] ${file.relativePath}`);

    if (errorMessage) {
      console.log(`    エラー: ${errorMessage}`);
      continue;
    }
    if (!header) {
      console.log('    ヘッダーを生成できませんでした');
      continue;
    }

    if (options.dryRun) {
      console.log(`    生成されたヘッダー:\n${header.split('\n').map(l => `       ${l}`).join('\n')}`);
    } else {
      insertHeader(file, header);
      updated++;
      console.log('    ヘッダーを挿入しました');
    }
  }

  console.log('\n=== 完了 ===');
  console.log(`処理: ${processed}件`);
  if (!options.dryRun) {
    console.log(`更新: ${updated}件`);
  }
}

// ============================================================================
// Prompt Loading
// ============================================================================

function loadHeaderSystemPrompt(): string {
  try {
    if (!existsSync(APPEND_SYSTEM_PATH)) return HEADER_PROMPT_FALLBACK;
    const content = readFileSync(APPEND_SYSTEM_PATH, 'utf-8');
    const start = content.indexOf(HEADER_PROMPT_START);
    const end = content.indexOf(HEADER_PROMPT_END);
    if (start === -1 || end === -1 || end <= start) return HEADER_PROMPT_FALLBACK;
    const body = content.slice(start + HEADER_PROMPT_START.length, end).trim();
    return body || HEADER_PROMPT_FALLBACK;
  } catch {
    return HEADER_PROMPT_FALLBACK;
  }
}

function buildPrompt(file: FileInfo): string {
  return `# ABDDヘッダー生成
対象ファイル: ${file.relativePath}

## 出力フォーマット（厳守）
/**
 * @abdd.meta
 * path: ${file.relativePath}
 * role: ...
 * why: ...
 * related: file1, file2
 * public_api: ...
 * invariants: ...
 * side_effects: ...
 * failure_modes: ...
 *
 * @abdd.explain
 * overview: ...
 * what_it_does:
 *   - ...
 *   - ...
 * why_it_exists:
 *   - ...
 *   - ...
 * scope:
 *   in: ...
 *   out: ...
 */

## コード文脈
\`\`\`ts
${file.context}
\`\`\`

注意:
- 出力はコメントブロックのみ
- path は ${file.relativePath} をそのまま使う
- related は2〜4件
- 不明な情報は推測しすぎず、コードから読める範囲で記述する`;
}

// ============================================================================
// LLM Generation
// ============================================================================

async function generateHeader(
  model: Model,
  apiKey: string,
  file: FileInfo,
  options: Options
): Promise<string | null> {
  const prompt = buildPrompt(file);
  if (options.verbose) {
    console.log(`\n    [Prompt]\n${prompt.split('\n').map(l => `       ${l}`).join('\n')}`);
  }

  const context: Context = {
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    systemPrompt: loadHeaderSystemPrompt(),
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
      if (event.type === 'text_delta') response += event.delta;
      if (event.type === 'error') throw new Error(`LLM error: ${JSON.stringify(event)}`);
    }
    return response;
  })();

  await Promise.race([streamPromise, timeoutPromise]);

  return extractAndValidateHeader(response, file.relativePath);
}

function extractAndValidateHeader(response: string, expectedPath: string): string | null {
  const lines = response.split('\n');
  const block: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inBlock && trimmed.startsWith('/**')) {
      inBlock = true;
      block.push(line);
      if (trimmed.endsWith('*/')) break;
      continue;
    }
    if (inBlock) {
      block.push(line);
      if (trimmed.endsWith('*/')) break;
    }
  }

  if (block.length === 0) return null;
  const header = normalizeCommentBlock(block.join('\n'));

  const requiredSnippets = [
    '@abdd.meta',
    'path:',
    'role:',
    'why:',
    'related:',
    '@abdd.explain',
    'overview:',
    'what_it_does:',
    'why_it_exists:',
    'scope:',
    'in:',
    'out:',
  ];
  for (const snippet of requiredSnippets) {
    if (!header.includes(snippet)) return null;
  }

  if (!header.includes(`path: ${expectedPath}`)) {
    return header.replace(/path:\s*.*/g, `path: ${expectedPath}`);
  }
  return header;
}

function normalizeCommentBlock(comment: string): string {
  const trimmed = comment.trim();
  if (!trimmed.startsWith('/**') || !trimmed.endsWith('*/')) return comment;
  const body = trimmed
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map(line => line.trim().replace(/^\*\s?/, ''))
    .filter(Boolean);
  const lines = ['/**', ...body.map(line => ` * ${line}`), ' */'];
  return lines.join('\n');
}

// ============================================================================
// Header Insert
// ============================================================================

function buildFileInfo(filePath: string): FileInfo {
  const relativePath = relative(process.cwd(), filePath);
  const source = readFileSync(filePath, 'utf-8');
  const lines = source.split('\n');
  const existingHeaderRange = detectExistingHeaderRange(lines);
  const contextLines = existingHeaderRange
    ? removeRange(lines, existingHeaderRange.startLine - 1, existingHeaderRange.endLine - 1)
    : lines;
  const context = contextLines.slice(0, MAX_CONTEXT_LINES).join('\n');

  return { filePath, relativePath, context, existingHeaderRange };
}

function detectExistingHeaderRange(lines: string[]): { startLine: number; endLine: number } | undefined {
  let i = 0;
  if (lines[0]?.startsWith('#!')) i = 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (!lines[i]?.trim().startsWith('/**')) return undefined;

  let end = i;
  while (end < lines.length) {
    if (lines[end].includes('*/')) break;
    end++;
  }
  if (end >= lines.length) return undefined;

  const block = lines.slice(i, end + 1).join('\n');
  if (!block.includes('@abdd.meta')) return undefined;

  return { startLine: i + 1, endLine: end + 1 };
}

function shouldProcessFile(file: FileInfo, regenerate: boolean): boolean {
  return regenerate || !file.existingHeaderRange;
}

function insertHeader(file: FileInfo, header: string): void {
  const source = readFileSync(file.filePath, 'utf-8');
  let lines = source.split('\n');

  if (file.existingHeaderRange) {
    lines = removeRange(lines, file.existingHeaderRange.startLine - 1, file.existingHeaderRange.endLine - 1);
  }

  let insertIndex = 0;
  if (lines[0]?.startsWith('#!')) {
    insertIndex = 1;
    if (lines[1]?.trim() !== '') {
      lines.splice(1, 0, '');
      insertIndex = 2;
    } else {
      insertIndex = 2;
    }
  }

  const headerLines = header.split('\n');
  lines.splice(insertIndex, 0, ...headerLines, '');
  writeFileSync(file.filePath, lines.join('\n'), 'utf-8');
}

function removeRange(lines: string[], start: number, end: number): string[] {
  const copied = [...lines];
  copied.splice(start, end - start + 1);
  while (copied[start] !== undefined && copied[start].trim() === '') {
    copied.splice(start, 1);
  }
  return copied;
}

// ============================================================================
// Cache
// ============================================================================

function initCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function getFileHash(path: string): string {
  return createHash('sha256').update(readFileSync(path, 'utf-8')).digest('hex');
}

function getFileKey(file: FileInfo): string {
  return createHash('sha256').update(file.filePath).digest('hex').slice(0, 16);
}

function getCachePath(fileKey: string): string {
  return join(CACHE_DIR, `${fileKey}.json`);
}

function checkCache(file: FileInfo, modelId: string, force: boolean, noCache: boolean): string | null {
  if (force || noCache) return null;
  const key = getFileKey(file);
  const path = getCachePath(key);
  if (!existsSync(path)) return null;
  try {
    const entry = JSON.parse(readFileSync(path, 'utf-8')) as CacheEntry;
    if (entry.modelId !== modelId) return null;
    if (entry.fileHash !== getFileHash(file.filePath)) return null;
    return entry.header;
  } catch {
    return null;
  }
}

function cacheHeader(file: FileInfo, header: string, modelId: string) {
  initCacheDir();
  const fileKey = getFileKey(file);
  const entry: CacheEntry = {
    fileKey,
    header,
    fileHash: getFileHash(file.filePath),
    createdAt: Date.now(),
    modelId,
  };
  writeFileSync(getCachePath(fileKey), JSON.stringify(entry, null, 2), 'utf-8');
}

function clearCache() {
  if (existsSync(CACHE_DIR)) rmSync(CACHE_DIR, { recursive: true, force: true });
}

// ============================================================================
// Init / Files / Args
// ============================================================================

function parseArgs(args: string[]): Options {
  const options: Options = {
    dryRun: false,
    check: false,
    verbose: false,
    limit: 50,
    file: undefined,
    regenerate: false,
    force: false,
    noCache: false,
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
      case '--force':
        options.force = true;
        clearCache();
        break;
      case '--no-cache':
        options.noCache = true;
        break;
    }
  }
  return options;
}

async function initializePiSdk(): Promise<{ model: Model | null; apiKey: string | null }> {
  const piDir = join(homedir(), '.pi', 'agent');
  const settingsPath = join(piDir, 'settings.json');
  const authPath = join(piDir, 'auth.json');

  let provider = 'anthropic';
  let modelId = 'claude-sonnet-4-20250514';
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    provider = settings.defaultProvider || provider;
    modelId = settings.defaultModel || modelId;
  } catch {
    // Keep defaults
  }

  let model = getModel(provider, modelId);
  if (!model) model = getModel(provider, `${provider}.${modelId}`);
  if (!model) return { model: null, apiKey: null };

  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf-8'));
    const apiKey = auth[provider]?.type === 'api_key' ? auth[provider].key : null;
    return { model, apiKey };
  } catch {
    return { model, apiKey: null };
  }
}

function collectTargetFiles(options: Options): string[] {
  const rootDir = join(__dirname, '..');
  const extensionsDir = join(rootDir, '.pi/extensions');
  const libDir = join(rootDir, '.pi/lib');
  const files: string[] = [];

  if (options.file) {
    const abs = options.file.startsWith('/') ? options.file : join(rootDir, options.file);
    if (existsSync(abs)) files.push(abs);
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
      } else if (
        stat.isFile() &&
        (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
        !entry.endsWith('.d.ts') &&
        !entry.endsWith('.test.ts')
      ) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function resolveParallelLimit(taskCount: number): number {
  const env = process.env.ABDD_HEADER_MAX_PARALLEL;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return Math.min(Math.max(parsed, MIN_PARALLEL_LIMIT), MAX_PARALLEL_LIMIT, taskCount);
    }
  }
  return Math.min(DEFAULT_PARALLEL_LIMIT, taskCount);
}

async function checkMode(options: Options) {
  const files = collectTargetFiles(options);
  const missing: string[] = [];
  for (const file of files) {
    const info = buildFileInfo(file);
    if (!info.existingHeaderRange) missing.push(info.relativePath);
  }

  console.log(`ヘッダー未設定: ${missing.length}件\n`);
  if (missing.length > 0) {
    for (const path of missing.slice(0, 50)) {
      console.log(`- ${path}`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('エラー:', error);
  process.exit(1);
});
