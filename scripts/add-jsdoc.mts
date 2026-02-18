#!/usr/bin/env npx tsx
/**
 * JSDoc自動生成スクリプト
 *
 * TypeScriptソースファイルからJSDocがない関数・クラス・インターフェース・型を検出し、
 * pi SDKを使用して日本語のJSDocを生成してソースコードに挿入する。
 *
 * 使用方法:
 *   npx tsx scripts/add-jsdoc.mts [options] [files...]
 *
 * オプション:
 *   --dry-run       変更を適用せず、生成内容のみ表示
 *   --check         JSDocがない要素の数のみ表示（CI用）
 *   --verbose       詳細ログを出力
 *   --limit N       処理する要素数の上限（デフォルト: 50）
 *   --file PATH     特定ファイルのみ処理
 *   --regenerate    既存のJSDocも含めて再生成（--all も可）
 *
 * LLM設定:
 *   pi SDKのAuthStorageとstreamSimpleを使用して、
 *   piの設定から自動的にプロバイダー、モデル、APIキーを取得する。
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';
import * as ts from 'typescript';
import { fileURLToPath } from 'url';
import { streamSimple, getModel, type Context } from '@mariozechner/pi-ai';
import { AuthStorage, ModelRegistry, SettingsManager } from '@mariozechner/pi-coding-agent';
import type { Model } from '@mariozechner/pi-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Local implementations of utility functions (to avoid ESM import issues)
// ============================================================================

function buildRateLimitKey(provider: string, model: string): string {
  return `${provider.toLowerCase()}::${model.toLowerCase()}`;
}

async function runWithConcurrencyLimit<TInput, TResult>(
  inputs: TInput[],
  limit: number,
  fn: (input: TInput) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = [];
  const executing: Promise<void>[] = [];

  for (const input of inputs) {
    const promise = fn(input).then(result => {
      results.push(result);
    });
    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      // Remove completed promises
      const stillRunning = executing.filter(p => {
        let resolved = false;
        p.then(() => { resolved = true; }).catch(() => { resolved = true; });
        return !resolved;
      });
      executing.length = 0;
      executing.push(...stillRunning);
    }
  }

  await Promise.all(executing);
  return results;
}

function isRetryableError(error: unknown, statusCode?: number): boolean {
  if (statusCode === 429 || statusCode === 503 || statusCode === 502) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('rate limit') || msg.includes('429') ||
           msg.includes('overloaded') || msg.includes('timeout');
  }
  return false;
}

function notifyScheduler429(_provider: string, _model: string, _details?: string): void {
  // No-op stub for standalone script
}

function notifySchedulerSuccess(_provider: string, _model: string): void {
  // No-op stub for standalone script
}

function isSnapshotProviderInitialized(): boolean {
  return false;
}

function resolveUnifiedLimits(_input: { provider: string; model: string }): { concurrency: number } {
  return { concurrency: 3 };
}

function getConcurrencyLimit(_provider: string, _model: string): number {
  return 3;
}

function getSchedulerAwareLimit(_provider: string, _model: string, baseLimit: number): number {
  return baseLimit;
}

interface RetryConfig {
  rateLimitKey?: string;
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  shouldRetry?: (error: unknown, statusCode?: number) => boolean;
  onRetry?: (ctx: { attempt: number; error: unknown; statusCode?: number; delayMs: number }) => void;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const maxRetries = config.maxRetries ?? 3;
  const initialDelayMs = config.initialDelayMs ?? 1000;
  const maxDelayMs = config.maxDelayMs ?? 30000;
  const multiplier = config.multiplier ?? 2;

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const statusCode = error instanceof Error ? undefined : undefined;

      if (attempt < maxRetries && config.shouldRetry?.(error, statusCode) !== false) {
        config.onRetry?.({ attempt: attempt + 1, error, statusCode, delayMs });
        await new Promise(resolve => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * multiplier, maxDelayMs);
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}

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
}

interface Options {
  dryRun: boolean;
  check: boolean;
  verbose: boolean;
  limit: number;
  file?: string;
  /** 既存のJSDocも再生成する */
  regenerate: boolean;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  console.log('=== JSDoc自動生成スクリプト ===\n');

  if (options.check) {
    await checkMode(options);
    return;
  }

  if (options.dryRun) {
    console.log('🔍 ドライランモード: 変更は適用されません\n');
  }

  // pi SDKを使用してLLM設定を初期化
  console.log('🔌 pi設定を読み込み中...');
  const { authStorage, model, apiKey } = await initializePiSdk();

  if (!model) {
    console.error('❌ 利用可能なモデルが見つかりません');
    process.exit(1);
  }

  if (!apiKey) {
    console.error('❌ APIキーが見つかりません');
    process.exit(1);
  }

  console.log(`✅ モデル: ${model.provider}:${model.id}\n`);

  // 対象ファイルを収集
  const files = collectTargetFiles(options);
  console.log(`📁 対象ファイル: ${files.length}件\n`);

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
  console.log(`📝 ${modeLabel}: ${allElements.length}件\n`);

  if (allElements.length === 0) {
    console.log('✅ 処理対象の要素がありません。');
    return;
  }

  // 上限を適用
  const elementsToProcess = allElements.slice(0, options.limit);
  if (elementsToProcess.length < allElements.length) {
    console.log(`⚠️  上限により ${elementsToProcess.length}/${allElements.length} 件を処理します\n`);
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
  const rateLimitKey = buildRateLimitKey(model.provider, model.id);
  console.log(`⚙️  LLM並列数: ${parallelLimit}`);
  console.log('🚀 JSDocを並列生成中...\n');

  // 生成は並列、挿入は逐次（行番号ずれ対策）
  const generationResults = await runWithConcurrencyLimit(
    elementsToProcess,
    parallelLimit,
    async (element): Promise<GenerationResult> => {
      try {
        const jsDoc = await retryWithBackoff(
          () => generateJsDocWithStreamSimple(model, apiKey, element, options),
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
              }
            },
          }
        );

        notifySchedulerSuccess(model.provider, model.id);
        return { element, jsDoc };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (isLikelyRateLimitError(errorMessage)) {
          notifyScheduler429(model.provider, model.id, errorMessage);
        }
        return { element, jsDoc: null, errorMessage };
      }
    }
  );

  let processed = 0;
  let updated = 0;

  for (const result of generationResults) {
    processed++;
    const { element, jsDoc, errorMessage } = result;
    console.log(`\n[${processed}/${elementsToProcess.length}] ${element.type}: ${element.name}`);
    console.log(`    📄 ${relative(process.cwd(), element.filePath)}:${element.line}`);

    if (errorMessage) {
      console.log(`    ❌ エラー: ${errorMessage}`);
      continue;
    }

    if (!jsDoc) {
      console.log(`    ⚠️  JSDocを生成できませんでした`);
      continue;
    }

    if (options.dryRun) {
      console.log(`    📝 生成されたJSDoc:\n${jsDoc.split('\n').map(l => '       ' + l).join('\n')}`);
    } else {
      insertJsDoc(element, jsDoc);
      updated++;
      console.log(`    ✅ JSDocを挿入しました`);
    }
  }

  console.log(`\n=== 完了 ===`);
  console.log(`処理: ${processed}件`);
  if (!options.dryRun) {
    console.log(`更新: ${updated}件`);
  }
}

function resolveJSDocParallelLimit(model: Model, taskCount: number): number {
  try {
    const baseLimit = isSnapshotProviderInitialized()
      ? resolveUnifiedLimits({
          provider: model.provider,
          model: model.id,
          operationType: 'direct',
        }).effectiveConcurrency
      : getConcurrencyLimit(model.provider, model.id);
    const schedulerAware = getSchedulerAwareLimit(
      model.provider,
      model.id,
      baseLimit
    );
    const safeLimit = Number.isFinite(schedulerAware) ? Math.trunc(schedulerAware) : 1;
    return Math.max(1, Math.min(taskCount, safeLimit));
  } catch {
    return 1;
  }
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
    }
  }

  return options;
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
  authStorage: AuthStorage;
  model: Model | null;
  apiKey: string | null;
}> {
  // pi SDKの標準的な初期化パターン
  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);
  const settingsManager = SettingsManager.create();

  // settings.jsonからデフォルトモデルを取得
  const provider = settingsManager.getDefaultProvider() || 'anthropic';
  const modelId = settingsManager.getDefaultModel() || 'claude-sonnet-4-20250514';

  // モデルを検索（カスタムモデルも含む）
  let model = modelRegistry.find(provider, modelId);

  // 見つからない場合はビルトインモデルを検索
  if (!model) {
    model = getModel(provider, modelId);
  }

  // それでも見つからない場合は利用可能なモデルを取得
  if (!model) {
    const available = await modelRegistry.getAvailable();
    if (available.length > 0) {
      model = available[0];
    }
  }

  // APIキーを取得
  const apiKey = model ? await authStorage.getApiKey(model.provider) : null;

  return { authStorage, model, apiKey };
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
    systemPrompt: 'あなたはTypeScriptのJSDocコメント生成アシスタントです。日本語で簡潔かつ正確なJSDocを生成してください。コードブロック記法を使わず、生のJSDocのみを出力してください。',
  };

  // streamSimpleでLLMを呼び出し（pi推奨の方法）
  const eventStream = streamSimple(model, context, { apiKey });

  let response = '';

  // async iteratorでイベントを収集
  for await (const event of eventStream) {
    if (event.type === 'text_delta') {
      response += event.delta;
    }
    if (event.type === 'error') {
      throw new Error(`LLM error: ${JSON.stringify(event)}`);
    }
  }

  return extractJsDocFromResponse(response);
}

function buildPrompt(element: ElementInfo): string {
  return `以下のTypeScriptコードの要素に対して、日本語のJSDocコメントを1つだけ生成してください。

## 要素情報
- 種別: ${element.type}
- 名前: ${element.name}
- シグネチャ: ${element.signature}
- ファイル: ${relative(process.cwd(), element.filePath)}:${element.line}

## 周辺コード
\`\`\`typescript
${element.context}
\`\`\`

## 要件
1. 日本語で記述
2. 1行目は簡潔な要約（50文字以内）
3. @param で各パラメータの説明
4. @returns で戻り値の説明（関数の場合）
5. 余計な説明やコードブロック記法は不要

JSDocコメントのみを出力してください。`;
}

function extractJsDocFromResponse(response: string): string | null {
  // 最初の完全なJSDocブロックを抽出（ネストを許容しない）
  // `/**`で始まり、途中に`/**`を含まず、`*/`で終わるブロック
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

function insertJsDoc(element: ElementInfo, jsDoc: string): void {
  const sourceCode = readFileSync(element.filePath, 'utf-8');
  const lines = sourceCode.split('\n');

  // 既存のJSDocがある場合は削除（regenerateモード用）
  let insertIndex = element.line - 1;
  if (element.existingJsDocRange) {
    const deleteStart = element.existingJsDocRange.startLine - 1;
    const deleteCount = element.existingJsDocRange.endLine - element.existingJsDocRange.startLine + 1;
    lines.splice(deleteStart, deleteCount);
    insertIndex = deleteStart;
  }

  // 置換後の挿入位置を基準にインデントを決める
  const targetLine = lines[insertIndex] ?? '';
  const indentMatch = targetLine.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';

  // JSDocを整形してインデントを付与
  const indentedJsDocLines = normalizeJsDoc(jsDoc)
    .split('\n')
    .map(line => indent + line);

  // JSDocを行単位で挿入
  lines.splice(insertIndex, 0, ...indentedJsDocLines);

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
