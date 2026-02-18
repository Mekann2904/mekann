#!/usr/bin/env npx tsx
/**
 * ABDD Documentation Generator with Mermaid Diagrams
 *
 * TypeScriptソースファイルからAPIドキュメントとMermaid図を自動生成する
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, mkdtempSync, rmSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as ts from 'typescript';
import * as os from 'os';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

interface FunctionInfo {
  name: string;
  signature: string;
  line: number;
  jsDoc?: string;
  summary?: string;  // @summaryタグから抽出（シーケンス図用）
  parameters: { name: string; type: string; optional: boolean }[];
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
}

interface ClassInfo {
  name: string;
  line: number;
  jsDoc?: string;
  methods: { name: string; signature: string; visibility: string }[];
  properties: { name: string; type: string; visibility: string }[];
  extends?: string;
  implements: string[];
  isExported: boolean;
}

interface InterfaceInfo {
  name: string;
  line: number;
  jsDoc?: string;
  properties: { name: string; type: string; optional: boolean }[];
  methods: { name: string; signature: string }[];
  extends: string[];
  isExported: boolean;
}

interface TypeInfo {
  name: string;
  line: number;
  jsDoc?: string;
  definition: string;
  isExported: boolean;
}

interface ImportBinding {
  source: string;
  localName: string;
  importedName: string;
  kind: 'named' | 'default' | 'namespace';
}

interface ImportInfo {
  source: string;
  bindings: ImportBinding[];
}

/**
 * JSDocから@summaryタグを抽出
 */
function extractSummary(jsDoc: string | undefined): string | undefined {
  if (!jsDoc) return undefined;
  const match = jsDoc.match(/@summary\s+(.+)/);
  return match ? match[1].trim() : undefined;
}

/**
 * JSDocノードからテキスト全体を取得（@summary等のタグを含む）
 */
function getJsDocText(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
  const jsDocs = ts.getJSDocCommentsAndTags(node);
  if (jsDocs.length === 0) return undefined;
  
  // JSDoc全体をテキストとして取得
  return jsDocs.map(j => {
    if ('getText' in j && typeof j.getText === 'function') {
      return j.getText(sourceFile);
    }
    return '';
  }).join('\n');
}

// ユーザーフロー生成用の型
interface ToolInfo {
  name: string;
  description: string;
  executeFunction: string;
  line: number;
  executeExpr?: ts.Expression;       // execute関数のAST（PropertyAssignmentの場合）
  executeMethodDecl?: ts.MethodDeclaration; // execute関数のAST（MethodDeclarationの場合）
  executeCalls?: CallNode[];         // execute関数内の呼び出し（事前抽出）
}

interface CallNode {
  callee: string;
  displayName?: string;
  isAsync: boolean;
  line: number;
  /** 外部ファイルからインポートされた関数の場合、そのファイルパス */
  importedFrom?: string;
  /** importedFromに紐づくシンボル名 */
  importedSymbol?: string;
}

/** クロスファイル追跡用のキャッシュ */
interface CrossFileCache {
  /** ファイルパス → FileInfo */
  fileInfos: Map<string, FileInfo>;
  /** 関数名 → { filePath, functionInfo } のマッピング（インポート解決用） */
  functionLocations: Map<string, { filePath: string; info: FunctionInfo }>;
}

interface TypeCheckerContext {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFiles: Map<string, ts.SourceFile>;
  compilerOptions: ts.CompilerOptions;
}

interface FileInfo {
  path: string;
  relativePath: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  types: TypeInfo[];
  imports: ImportInfo[];
  exports: string[];
  // ユーザーフロー用
  tools: ToolInfo[];
  calls: Map<string, CallNode[]>;
}

// ============================================================================
// Main
// ============================================================================

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT_DIR = join(__dirname, '..');
const EXTENSIONS_DIR = join(ROOT_DIR, '.pi/extensions');
const LIB_DIR = join(ROOT_DIR, '.pi/lib');
const ABDD_DIR = join(ROOT_DIR, 'ABDD');

/** Mermaid検証の並列数（mmdcはPuppeteerを使用するため控えめに） */
const MERMAID_PARALLEL_LIMIT = 4;
/** mmdcのタイムアウト（ミリ秒） */
const MERMAID_TIMEOUT_MS = 30000;

/**
 * コマンドライン引数をパースする
 */
function parseArgs(args: string[]): { dryRun: boolean; verbose: boolean; file?: string } {
  return {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    file: args.find(a => a.startsWith('--file='))?.split('=')[1],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  globalOptions = options;

  console.log('=== ABDD Documentation Generator ===\n');

  if (options.dryRun) {
    console.log('ドライランモード: ファイルは書き込まれません\n');
  }

  // ABDDディレクトリを作成
  if (!options.dryRun) {
    mkdirIfNotExists(join(ABDD_DIR, '.pi/extensions'));
    mkdirIfNotExists(join(ABDD_DIR, '.pi/lib'));
  }

  // --file オプションがある場合はそのファイルだけ処理
  if (options.file) {
    console.log(`Processing single file: ${options.file}`);
    const fullPath = join(EXTENSIONS_DIR, options.file);
    processFile(fullPath, EXTENSIONS_DIR, join(ABDD_DIR, '.pi/extensions'));
    console.log('\n=== Done ===');
    return;
  }

  // Extensions ファイルを処理
  console.log('Processing extensions...');
  const extensionFiles = collectTypeScriptFiles(EXTENSIONS_DIR);
  for (const file of extensionFiles) {
    processFile(file, EXTENSIONS_DIR, join(ABDD_DIR, '.pi/extensions'));
  }

  // Lib ファイルを処理
  console.log('Processing lib...');
  const libFiles = collectTypeScriptFiles(LIB_DIR);
  for (const file of libFiles) {
    processFile(file, LIB_DIR, join(ABDD_DIR, '.pi/lib'));
  }

  // Mermaid図を検証（dryRunの場合はスキップ）
  if (options.dryRun) {
    console.log('\nドライランのため、Mermaid検証をスキップします');
  } else {
    const errors = await validateAllMermaidDiagrams();

    if (errors.length > 0) {
      console.log('\n⚠️  Mermaid errors detected. Please fix the generation logic.');
      process.exit(1);
    }
  }

  console.log('\n=== Done ===');
}

// ============================================================================
// Global Options
// ============================================================================

let globalOptions = { dryRun: false, verbose: false };

// クロスファイル追跡用のグローバルキャッシュ
const crossFileCache: CrossFileCache = {
  fileInfos: new Map(),
  functionLocations: new Map(),
};

let typeCheckerContext: TypeCheckerContext | null = null;

function normalizeFsPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function buildTypeCheckerContext(): TypeCheckerContext | null {
  try {
    const configCandidates = [
      join(ROOT_DIR, 'tsconfig-check.json'),
      join(ROOT_DIR, 'tsconfig.json'),
    ];
    const configPath = configCandidates.find(p => existsSync(p));

    let program: ts.Program;
    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
      if (configFile.error) {
        throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
      }

      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        dirname(configPath),
      );
      program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
      });
    } else {
      const rootNames = [
        ...collectTypeScriptFiles(EXTENSIONS_DIR),
        ...collectTypeScriptFiles(LIB_DIR),
      ];
      program = ts.createProgram({
        rootNames,
        options: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          allowJs: false,
          skipLibCheck: true,
        },
      });
    }

    const checker = program.getTypeChecker();
    const sourceFiles = new Map<string, ts.SourceFile>();
    for (const sf of program.getSourceFiles()) {
      sourceFiles.set(normalizeFsPath(sf.fileName), sf);
    }
    return {
      program,
      checker,
      sourceFiles,
      compilerOptions: program.getCompilerOptions(),
    };
  } catch (error) {
    if (globalOptions.verbose) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[TypeChecker] 初期化失敗: ${msg}`);
    }
    return null;
  }
}

function getTypeCheckerContext(): TypeCheckerContext | null {
  if (typeCheckerContext !== null) return typeCheckerContext;
  typeCheckerContext = buildTypeCheckerContext();
  return typeCheckerContext;
}

// ============================================================================
// File Processing
// ============================================================================

function processFile(filePath: string, baseDir: string, outputDir: string) {
  const relativePath = relative(baseDir, filePath);
  const outputName = relativePath.replace(/\.ts$/, '.md');
  const outputPath = join(outputDir, outputName);

  if (globalOptions.verbose) {
    console.log(`  [解析中] ${relativePath}`);
  } else {
    console.log(`  ${relativePath}`);
  }

  // TypeScriptファイルを解析
  const info = analyzeFile(filePath, baseDir);

  // Markdown を生成
  const markdown = generateMarkdown(info);

  if (globalOptions.dryRun) {
    if (globalOptions.verbose) {
      console.log(`    [ドライラン] ${outputPath} に書き込む予定（スキップ）`);
      console.log(`    --- 生成内容（先頭50行）---`);
      console.log(markdown.split('\n').slice(0, 50).join('\n'));
      console.log(`    ---`);
    }
    return;
  }

  // 出力ディレクトリを作成
  mkdirIfNotExists(dirname(outputPath));

  // ファイルに書き込み
  writeFileSync(outputPath, markdown, 'utf-8');
}

function analyzeFile(filePath: string, baseDir: string): FileInfo {
  const sourceCode = readFileSync(filePath, 'utf-8');
  const checkerCtx = getTypeCheckerContext();
  const checkerSourceFile = checkerCtx?.sourceFiles.get(normalizeFsPath(filePath));
  const sourceFile = checkerSourceFile || ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const types: TypeInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: string[] = [];

  // AST走査
  function visit(node: ts.Node) {
    // インポート
    if (ts.isImportDeclaration(node)) {
      const source = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
      const bindings: ImportBinding[] = [];
      if (node.importClause?.name) {
        bindings.push({
          source,
          localName: node.importClause.name.getText(sourceFile),
          importedName: 'default',
          kind: 'default',
        });
      }
      if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const spec of node.importClause.namedBindings.elements) {
          bindings.push({
            source,
            localName: spec.name.getText(sourceFile),
            importedName: spec.propertyName?.getText(sourceFile) || spec.name.getText(sourceFile),
            kind: 'named',
          });
        }
      }
      if (node.importClause?.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
        bindings.push({
          source,
          localName: node.importClause.namedBindings.name.getText(sourceFile),
          importedName: '*',
          kind: 'namespace',
        });
      }
      imports.push({ source, bindings });
    }

    // 関数
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
      const params = Array.from(node.parameters).map(p => ({
        name: p.name.getText(sourceFile),
        type: p.type?.getText(sourceFile) || 'any',
        optional: p.questionToken !== undefined,
      }));
      const returnType = node.type?.getText(sourceFile) || 'void';
      const jsDocComment = ts.getJSDocCommentsAndTags(node).map(j => (j as ts.JSDoc).comment).filter(Boolean).join('\n');
      const jsDocText = getJsDocText(node, sourceFile);

      functions.push({
        name,
        signature: `${isAsync ? 'async ' : ''}${name}(${params.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')}): ${returnType}`,
        line,
        jsDoc: jsDocComment || undefined,
        summary: extractSummary(jsDocText),
        parameters: params,
        returnType,
        isAsync,
        isExported,
      });
    }

    // 変数宣言（矢印関数など）
    if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const name = node.name.getText(sourceFile);
      if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        const func = node.initializer;
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const varStmt = node.parent?.parent;
        const isExported = varStmt && ts.isVariableStatement(varStmt) &&
          (varStmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);
        const isAsync = func.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
        const params = Array.from(func.parameters).map(p => ({
          name: p.name.getText(sourceFile),
          type: p.type?.getText(sourceFile) || 'any',
          optional: p.questionToken !== undefined,
        }));
        const returnType = func.type?.getText(sourceFile) || 'void';
        // VariableStatementからJSDocを取得
        const jsDocComment = varStmt
          ? ts.getJSDocCommentsAndTags(varStmt).map(j => (j as ts.JSDoc).comment).filter(Boolean).join('\n')
          : undefined;
        const jsDocText = varStmt ? getJsDocText(varStmt, sourceFile) : undefined;

        functions.push({
          name,
          signature: `${isAsync ? 'async ' : ''}${name}(${params.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')}): ${returnType}`,
          line,
          jsDoc: jsDocComment || undefined,
          summary: extractSummary(jsDocText),
          parameters: params,
          returnType,
          isAsync,
          isExported: isExported ?? false,
        });
      }
    }

    // クラス
    if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      const jsDoc = ts.getJSDocCommentsAndTags(node).map(j => (j as ts.JSDoc).comment).filter(Boolean).join('\n');

      const extendsClause = node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword);
      const extendsClass = extendsClause?.types[0]?.getText(sourceFile);

      const methods: ClassInfo['methods'] = [];
      const properties: ClassInfo['properties'] = [];

      for (const member of node.members) {
        if (ts.isMethodDeclaration(member)) {
          const methodName = member.name.getText(sourceFile);
          const visibility = member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ? 'private' :
            member.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword) ? 'protected' : 'public';
          const params = Array.from(member.parameters).map(p => p.name.getText(sourceFile)).join(', ');
          const ret = member.type?.getText(sourceFile) || 'void';
          methods.push({ name: methodName, signature: `${methodName}(${params}): ${ret}`, visibility });
        }
        if (ts.isPropertyDeclaration(member)) {
          const propName = member.name.getText(sourceFile);
          const propType = member.type?.getText(sourceFile) || 'any';
          const visibility = member.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ? 'private' :
            member.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword) ? 'protected' : 'public';
          properties.push({ name: propName, type: propType, visibility });
        }
      }

      classes.push({
        name,
        line,
        jsDoc: jsDoc || undefined,
        methods,
        properties,
        extends: extendsClass,
        implements: [],
        isExported,
      });
    }

    // インターフェース
    if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      const jsDoc = ts.getJSDocCommentsAndTags(node).map(j => (j as ts.JSDoc).comment).filter(Boolean).join('\n');

      const properties: InterfaceInfo['properties'] = [];
      const methods: InterfaceInfo['methods'] = [];

      for (const member of node.members) {
        if (ts.isPropertySignature(member)) {
          properties.push({
            name: member.name.getText(sourceFile),
            type: member.type?.getText(sourceFile) || 'any',
            optional: member.questionToken !== undefined,
          });
        }
        if (ts.isMethodSignature(member)) {
          const methodName = member.name.getText(sourceFile);
          const params = Array.from(member.parameters).map(p => p.name.getText(sourceFile)).join(', ');
          methods.push({ name: methodName, signature: `${methodName}(${params})` });
        }
      }

      interfaces.push({ name, line, jsDoc: jsDoc || undefined, properties, methods, extends: [], isExported });
    }

    // 型エイリアス
    if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.getText(sourceFile);
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
      const jsDoc = ts.getJSDocCommentsAndTags(node).map(j => (j as ts.JSDoc).comment).filter(Boolean).join('\n');
      const definition = node.type?.getText(sourceFile) || '';

      types.push({ name, line, jsDoc: jsDoc || undefined, definition, isExported });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // ツール登録を検出
  const tools = detectToolRegistrations(sourceFile);

  // 関数内の呼び出しを抽出（インポートされた関数も含む）
  const calls = extractAllCalls(
    sourceFile,
    functions,
    imports,
    checkerCtx?.checker
  );

  // 関数名のセットを作成（インポートされた関数も含む）
  const functionNames = new Set(functions.map(f => f.name));
  for (const imp of imports) {
    for (const binding of imp.bindings) {
      functionNames.add(binding.localName);
    }
  }

  // 各ツールのexecute関数内の呼び出しを抽出
  for (const tool of tools) {
    if (tool.executeExpr) {
      tool.executeCalls = extractCallsFromExecute(sourceFile, tool.executeExpr, functionNames, imports, checkerCtx?.checker);
    } else if (tool.executeMethodDecl) {
      tool.executeCalls = extractCallsFromExecute(sourceFile, tool.executeMethodDecl, functionNames, imports, checkerCtx?.checker);
    }
  }

  return {
    path: filePath,
    relativePath: relative(baseDir, filePath),
    functions,
    classes,
    interfaces,
    types,
    imports,
    exports,
    tools,
    calls,
  };
}

// ============================================================================
// User Flow Generation (Tool Detection & Call Extraction)
// ============================================================================

/**
 * pi.registerTool() で登録されたツールを検出する
 */
function detectToolRegistrations(sourceFile: ts.SourceFile): ToolInfo[] {
  const tools: ToolInfo[] = [];

  function visit(node: ts.Node) {
    // pi.registerTool({ name: "...", description: "...", execute: ... })
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr) &&
          expr.name.getText(sourceFile) === "registerTool") {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) {
          // nameプロパティを探す
          const nameProp = arg.properties.find(p =>
            ts.isPropertyAssignment(p) && p.name?.getText(sourceFile) === "name"
          );
          
          // descriptionプロパティを探す
          const descProp = arg.properties.find(p =>
            ts.isPropertyAssignment(p) && p.name?.getText(sourceFile) === "description"
          );
          
          // executeプロパティを探す（PropertyAssignment または MethodDeclaration）
          const executeProp = arg.properties.find(p => {
            const name = p.name?.getText(sourceFile);
            return name === "execute";
          });

          if (nameProp && ts.isPropertyAssignment(nameProp)) {
            const nameValue = getStringLiteralValue(nameProp.initializer);
            const descValue = descProp && ts.isPropertyAssignment(descProp)
              ? getStringLiteralValue(descProp.initializer) || ""
              : "";
            
            let executeFn: string | undefined;
            let executeExpr: ts.Expression | undefined;

            if (executeProp) {
              if (ts.isPropertyAssignment(executeProp)) {
                executeFn = extractFunctionName(executeProp.initializer);
                executeExpr = executeProp.initializer;
              } else if (ts.isMethodDeclaration(executeProp)) {
                // async execute(...) { ... } 形式
                executeFn = "";
                // MethodDeclarationの本体をFunctionExpressionとして扱う
                // 実際には、メソッド本体を直接走査する
                executeExpr = undefined; // MethodDeclarationはExpressionではない
              }
            }

            if (nameValue) {
              tools.push({
                name: nameValue,
                description: descValue,
                executeFunction: executeFn || "",
                line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                executeExpr,
                // MethodDeclarationの場合は直接ノードを保存
                executeMethodDecl: (executeProp && ts.isMethodDeclaration(executeProp)) ? executeProp : undefined,
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tools;
}

/**
 * 文字列リテラルの値を取得
 */
function getStringLiteralValue(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr)) {
    return expr.text;
  }
  return null;
}

/**
 * 関数名を抽出（関数宣言、矢印関数、関数式から）
 */
function extractFunctionName(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) {
    // 無名関数の場合は空文字を返す
    return "";
  }
  return null;
}

/**
 * インポートされた関数の定義ファイルを解決
 * @param funcName - 関数名
 * @param imports - インポート情報
 * @param currentFilePath - 現在のファイルパス
 * @returns 解決されたファイルパス（見つからない場合はundefined）
 */
function resolveImportedFunction(
  call: CallNode,
  imports: ImportInfo[],
  currentFilePath: string
): { filePath?: string; symbol: string } {
  if (call.importedFrom) {
    return {
      filePath: call.importedFrom,
      symbol: call.importedSymbol || call.callee,
    };
  }

  for (const imp of imports) {
    for (const binding of imp.bindings) {
      if (binding.localName !== call.callee && binding.importedName !== call.callee) {
        continue;
      }
      const resolvedPath = resolveImportSourcePath(binding.source, currentFilePath);
      const symbol = binding.kind === 'default'
        ? call.callee
        : (binding.importedName === '*' ? call.callee : binding.importedName);
      return { filePath: resolvedPath, symbol };
    }
  }
  return { symbol: call.callee };
}

/**
 * 外部ファイルの関数情報を取得（キャッシュ付き）
 */
function getExternalFileInfo(
  filePath: string
): { functions: FunctionInfo[]; calls: Map<string, CallNode[]>; imports: ImportInfo[] } | undefined {
  // キャッシュを確認
  const cached = crossFileCache.fileInfos.get(filePath);
  if (cached) {
    return { functions: cached.functions, calls: cached.calls, imports: cached.imports };
  }

  // ファイルを解析
  if (!existsSync(filePath)) {
    return undefined;
  }

  try {
    // analyzeFileと同じ処理を行う（baseDirはdirnameを使用）
    const baseDir = dirname(filePath);
    const info = analyzeFile(filePath, baseDir);
    
    // キャッシュに保存
    crossFileCache.fileInfos.set(filePath, info);
    
    return { functions: info.functions, calls: info.calls, imports: info.imports };
  } catch {
    return undefined;
  }
}

/**
 * すべての関数から呼び出しを抽出
 * インポートされた関数も追跡対象に含む
 */
function extractAllCalls(
  sourceFile: ts.SourceFile,
  functions: FunctionInfo[],
  imports: ImportInfo[],
  checker?: ts.TypeChecker
): Map<string, CallNode[]> {
  const calls = new Map<string, CallNode[]>();
  
  const localFunctionNames = new Set(functions.map(f => f.name));
  const importLookup = buildImportLookup(imports);

  // 関数宣言・矢印関数を探して呼び出しを抽出
  function visitFunction(node: ts.Node, funcName: string) {
    const funcCalls: CallNode[] = [];

    function extractCalls(n: ts.Node) {
      // await someFunction() → 非同期呼び出し
      if (ts.isAwaitExpression(n)) {
        if (ts.isCallExpression(n.expression)) {
          const resolved = resolveCallTarget(
            n.expression.expression,
            localFunctionNames,
            importLookup,
            currentFilePathFromSource(sourceFile),
            checker
          );
          if (resolved) {
            funcCalls.push({
              callee: resolved.callee,
              displayName: resolved.displayName,
              isAsync: true,
              line: sourceFile.getLineAndCharacterOfPosition(n.getStart()).line + 1,
              importedFrom: resolved.importedFrom,
              importedSymbol: resolved.importedSymbol,
            });
          }
        }
      }
      // someFunction() → 同期呼び出し
      else if (ts.isCallExpression(n)) {
        // await式の内部でない場合
        if (!ts.isAwaitExpression(n.parent)) {
          const resolved = resolveCallTarget(
            n.expression,
            localFunctionNames,
            importLookup,
            currentFilePathFromSource(sourceFile),
            checker
          );
          if (resolved) {
            funcCalls.push({
              callee: resolved.callee,
              displayName: resolved.displayName,
              isAsync: false,
              line: sourceFile.getLineAndCharacterOfPosition(n.getStart()).line + 1,
              importedFrom: resolved.importedFrom,
              importedSymbol: resolved.importedSymbol,
            });
          }
        }
      }
      ts.forEachChild(n, extractCalls);
    }

    ts.forEachChild(node, extractCalls);

    if (funcCalls.length > 0) {
      calls.set(funcName, funcCalls);
    }
  }

  // 関数宣言を探す
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      visitFunction(node, node.name.getText(sourceFile));
    }
    // 矢印関数・関数式の変数宣言
    else if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
      const name = node.name.getText(sourceFile);
      if (node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        visitFunction(node.initializer, name);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

/**
 * executeプロパティ（矢印関数/関数式/メソッド宣言）内の呼び出しを直接抽出
 * ツール登録のexecute関数専用
 */
function extractCallsFromExecute(
  sourceFile: ts.SourceFile,
  executeExpr: ts.Expression | ts.MethodDeclaration,
  functionNames: Set<string>,
  imports: ImportInfo[],
  checker?: ts.TypeChecker
): CallNode[] {
  const funcCalls: CallNode[] = [];
  const importLookup = buildImportLookup(imports);

  // 矢印関数、関数式、メソッド宣言を処理
  const isValidFunction = ts.isArrowFunction(executeExpr) || 
                          ts.isFunctionExpression(executeExpr) ||
                          ts.isMethodDeclaration(executeExpr);
  
  if (!isValidFunction) {
    return funcCalls;
  }

  function extractCalls(n: ts.Node) {
    // await someFunction() → 非同期呼び出し
    if (ts.isAwaitExpression(n)) {
      if (ts.isCallExpression(n.expression)) {
        const resolved = resolveCallTarget(
          n.expression.expression,
          functionNames,
          importLookup,
          currentFilePathFromSource(sourceFile),
          checker
        );
        if (resolved) {
          funcCalls.push({
            callee: resolved.callee,
            displayName: resolved.displayName,
            isAsync: true,
            line: sourceFile.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            importedFrom: resolved.importedFrom,
            importedSymbol: resolved.importedSymbol,
          });
        }
      }
    }
    // someFunction() → 同期呼び出し
    else if (ts.isCallExpression(n)) {
      if (!ts.isAwaitExpression(n.parent)) {
        const resolved = resolveCallTarget(
          n.expression,
          functionNames,
          importLookup,
          currentFilePathFromSource(sourceFile),
          checker
        );
        if (resolved) {
          funcCalls.push({
            callee: resolved.callee,
            displayName: resolved.displayName,
            isAsync: false,
            line: sourceFile.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            importedFrom: resolved.importedFrom,
            importedSymbol: resolved.importedSymbol,
          });
        }
      }
    }
    ts.forEachChild(n, extractCalls);
  }

  ts.forEachChild(executeExpr, extractCalls);
  return funcCalls;
}

/**
 * importのローカル名索引を作成
 */
function buildImportLookup(imports: ImportInfo[]): {
  byLocalName: Map<string, ImportBinding>;
  namespaceByLocalName: Map<string, ImportBinding>;
} {
  const byLocalName = new Map<string, ImportBinding>();
  const namespaceByLocalName = new Map<string, ImportBinding>();
  for (const imp of imports) {
    for (const binding of imp.bindings) {
      if (binding.kind === 'namespace') {
        namespaceByLocalName.set(binding.localName, binding);
      } else {
        byLocalName.set(binding.localName, binding);
      }
    }
  }
  return { byLocalName, namespaceByLocalName };
}

/**
 * import sourceから実ファイルパスを推定する（ローカル import のみ）
 */
function resolveImportSourcePath(source: string, currentFilePath: string): string | undefined {
  if (!source.startsWith('.')) return undefined;

  // TypeScript公式のモジュール解決を優先（paths/baseUrl含む）
  const compilerOptions = getTypeCheckerContext()?.compilerOptions;
  if (compilerOptions) {
    const resolved = ts.resolveModuleName(source, currentFilePath, compilerOptions, ts.sys);
    const resolvedFileName = resolved.resolvedModule?.resolvedFileName;
    if (resolvedFileName && existsSync(resolvedFileName)) {
      // .d.ts を引いた場合は実装ファイルを優先して探す
      if (resolvedFileName.endsWith('.d.ts')) {
        const impl = resolveDeclarationToImplementation(resolvedFileName);
        return impl || resolvedFileName;
      }
      return resolvedFileName;
    }
  }

  // フォールバック: 既存の手動候補探索
  const currentDir = dirname(currentFilePath);
  const baseResolvedPath = join(currentDir, source);
  const candidates = [
    baseResolvedPath,
    `${baseResolvedPath}.ts`,
    `${baseResolvedPath}.tsx`,
    `${baseResolvedPath}.js`,
    join(baseResolvedPath, 'index.ts'),
    join(baseResolvedPath, 'index.tsx'),
    join(baseResolvedPath, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function resolveDeclarationToImplementation(dtsPath: string): string | undefined {
  const withoutDts = dtsPath.replace(/\.d\.ts$/, '');
  const candidates = [
    `${withoutDts}.ts`,
    `${withoutDts}.tsx`,
    `${withoutDts}.js`,
    join(withoutDts, 'index.ts'),
    join(withoutDts, 'index.tsx'),
    join(withoutDts, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function currentFilePathFromSource(sourceFile: ts.SourceFile): string {
  return sourceFile.fileName;
}

/**
 * 呼び出し式を実体シンボルに解決
 */
function resolveCallTarget(
  expr: ts.Expression | undefined,
  localFunctionNames: Set<string>,
  importLookup: {
    byLocalName: Map<string, ImportBinding>;
    namespaceByLocalName: Map<string, ImportBinding>;
  },
  currentFilePath: string,
  checker?: ts.TypeChecker
): { callee: string; displayName: string; importedFrom?: string; importedSymbol?: string } | null {
  if (!expr) return null;

  const fromChecker = resolveCallTargetWithTypeChecker(expr, currentFilePath, checker);
  if (fromChecker) {
    // TypeCheckerで十分な情報が取れた場合を優先する
    if (fromChecker.importedFrom || localFunctionNames.has(fromChecker.callee)) {
      return fromChecker;
    }
  }

  if (ts.isIdentifier(expr)) {
    const name = expr.text;
    if (localFunctionNames.has(name)) {
      return { callee: name, displayName: name };
    }

    const binding = importLookup.byLocalName.get(name);
    if (!binding) return null;

    return {
      callee: binding.kind === 'named' ? binding.importedName : binding.localName,
      displayName: name,
      importedFrom: resolveImportSourcePath(binding.source, currentFilePath),
      importedSymbol: binding.kind === 'named' ? binding.importedName : binding.importedName,
    };
  }

  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const objectName = expr.expression.text;
    const propertyName = expr.name.text;

    const namespaceBinding = importLookup.namespaceByLocalName.get(objectName);
    if (namespaceBinding) {
      return {
        callee: propertyName,
        displayName: `${objectName}.${propertyName}`,
        importedFrom: resolveImportSourcePath(namespaceBinding.source, currentFilePath),
        importedSymbol: propertyName,
      };
    }

    if (localFunctionNames.has(propertyName)) {
      return { callee: propertyName, displayName: `${objectName}.${propertyName}` };
    }
  }

  return null;
}

function resolveCallTargetWithTypeChecker(
  expr: ts.Expression,
  currentFilePath: string,
  checker?: ts.TypeChecker
): { callee: string; displayName: string; importedFrom?: string; importedSymbol?: string } | null {
  if (!checker) return null;

  const symbolAtExpr = checker.getSymbolAtLocation(expr);
  if (!symbolAtExpr) return null;

  const resolvedSymbol = (symbolAtExpr.flags & ts.SymbolFlags.Alias)
    ? checker.getAliasedSymbol(symbolAtExpr)
    : symbolAtExpr;
  const declarations = resolvedSymbol.declarations || [];
  const declaration = declarations[0];
  if (!declaration) return null;

  const declaredFile = declaration.getSourceFile().fileName;
  const symbolName = resolvedSymbol.getName();
  const displayName = expr.getText();

  if (normalizeFsPath(declaredFile) !== normalizeFsPath(currentFilePath)) {
    return {
      callee: symbolName,
      displayName,
      importedFrom: declaredFile,
      importedSymbol: symbolName,
    };
  }

  return {
    callee: symbolName,
    displayName,
  };
}

/**
 * 関数名からアクター（参加者）を分類
 */
function classifyFunction(name: string, info?: FunctionInfo): string {
  if (!info) return "Internal";

  const nm = name.toLowerCase();
  const desc = (info.jsDoc || "").toLowerCase();

  // LLM関連
  if (nm.includes("llm") || nm.includes("pi") || nm.includes("print") ||
      desc.includes("llm") || desc.includes("model") || desc.includes("provider")) {
    return "LLM";
  }
  // ランタイム関連
  if (nm.includes("runtime") || nm.includes("capacity") || nm.includes("queue") ||
      nm.includes("wait") || nm.includes("parallel") || nm.includes("limit")) {
    return "Runtime";
  }
  // チーム・メンバー関連
  if (nm.includes("member") || nm.includes("team") || nm.includes("agent") ||
      nm.includes("teammate")) {
    return "Team";
  }
  // 判定・検証関連
  if (nm.includes("judge") || nm.includes("validate") || nm.includes("check") ||
      nm.includes("verify") || nm.includes("resolve")) {
    return "Judge";
  }
  // ストレージ関連
  if (nm.includes("storage") || nm.includes("load") || nm.includes("save") ||
      nm.includes("read") || nm.includes("write") || nm.includes("file")) {
    return "Storage";
  }
  // 実行関連
  if (nm.includes("run") || nm.includes("execute") || nm.includes("start") ||
      nm.includes("process") || nm.includes("handle")) {
    return "Executor";
  }

  return "Internal";
}

/**
 * 関数名からアクションラベルを生成
 * JSDocの日本語コメントがあればそれを優先、なければ関数名をそのまま使用
 */
function generateActionLabel(name: string, info?: FunctionInfo): string {
  // @summaryタグがあれば優先使用（シーケンス図用に最適化された短い説明）
  if (info?.summary) {
    return info.summary;
  }

  // JSDocの最初の行を使う（日本語が含まれている場合のみ）
  if (info?.jsDoc) {
    const firstLine = info.jsDoc.split("\n")[0].trim();
    // 日本語が含まれている場合は使用
    if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(firstLine) && firstLine.length < 50) {
      return firstLine;
    }
  }

  // デフォルト: 関数名をそのまま使用
  return name;
}

/**
 * ユーザーフローのシーケンス図を生成
 */
function generateUserSequence(
  tool: ToolInfo,
  allFunctions: Map<string, FunctionInfo>,
  calls: Map<string, CallNode[]>,
  imports: ImportInfo[],
  currentFilePath: string,
  maxDepth: number = 4
): string {
  const participants = new Map<string, string>();
  const steps: { from: string; to: string; action: string; isAsync: boolean }[] = [];

  // 参加者を追加
  participants.set("User", "actor User as ユーザー");
  participants.set("System", "participant System as System");

  // 既に追加した参加者を追跡
  const addedParticipants = new Set<string>(["User", "System"]);

  // 呼び出しを再帰的に追跡
  function traceCalls(
    funcName: string,
    callerActor: string,
    currentDepth: number,
    visited: Set<string>
  ) {
    if (currentDepth > maxDepth || visited.has(funcName)) return;
    visited.add(funcName);

    const funcCalls = calls.get(funcName);
    if (!funcCalls) return;

    const funcInfo = allFunctions.get(funcName);

    for (const call of funcCalls) {
      const calleeInfo = allFunctions.get(call.callee);
      const actor = classifyFunction(call.callee, calleeInfo);

      // 参加者を追加
      if (!addedParticipants.has(actor)) {
        participants.set(actor, `participant ${sanitizeMermaidIdentifier(actor)} as "${actor}"`);
        addedParticipants.add(actor);
      }

      // アクションラベルを生成
      const actionLabel = generateActionLabel(call.callee, calleeInfo);

      steps.push({
        from: callerActor,
        to: actor,
        action: actionLabel,
        isAsync: call.isAsync,
      });

      // 再帰的に追跡
      traceCalls(call.callee, actor, currentDepth + 1, visited);
    }
  }

  // CallNode配列から直接ステップを生成（クロスファイル追跡対応）
  function traceCallNodes(
    callNodes: CallNode[],
    callerActor: string,
    currentDepth: number,
    visited: Set<string>,
    currentFileImports: ImportInfo[],
    currentFilePath: string
  ) {
    if (currentDepth > maxDepth) return;

    for (const call of callNodes) {
      if (visited.has(call.callee)) continue;
      visited.add(call.callee);

      // 同一ファイル内の関数か、インポートされた関数かを判定
      let calleeInfo = allFunctions.get(call.callee);
      let calleeCalls = calls.get(call.callee);
      let calleeImports = currentFileImports;
      let calleeFilePath = currentFilePath;

      // インポートされた関数の場合、外部ファイルから情報を取得
      if (!calleeInfo) {
        const resolved = resolveImportedFunction(call, currentFileImports, currentFilePath);
        if (resolved.filePath) {
          const externalInfo = getExternalFileInfo(resolved.filePath);
          if (externalInfo) {
            // 外部ファイルの関数情報を一時的にallFunctionsに追加
            for (const fn of externalInfo.functions) {
              if (fn.name === resolved.symbol || fn.name === call.callee) {
                calleeInfo = fn;
                break;
              }
            }
            calleeCalls = externalInfo.calls.get(resolved.symbol) || externalInfo.calls.get(call.callee);
            calleeImports = externalInfo.imports;
            calleeFilePath = resolved.filePath;
          }
        }
      }

      const actor = calleeInfo
        ? classifyFunction(call.callee, calleeInfo)
        : (call.importedFrom ? "Unresolved" : "Internal");

      // 参加者を追加
      if (!addedParticipants.has(actor)) {
        participants.set(actor, `participant ${sanitizeMermaidIdentifier(actor)} as "${actor}"`);
        addedParticipants.add(actor);
      }

      // アクションラベルを生成
      let actionLabel = generateActionLabel(call.callee, calleeInfo);
      if (!calleeInfo && call.displayName) {
        actionLabel = call.displayName;
      }
      if (call.importedFrom && !calleeInfo) {
        actionLabel = `${actionLabel} (${relative(ROOT_DIR, call.importedFrom)})`;
      }

      steps.push({
        from: callerActor,
        to: actor,
        action: actionLabel,
        isAsync: call.isAsync,
      });

      // 再帰的に追跡
      if (calleeCalls) {
        traceCallNodes(calleeCalls, actor, currentDepth + 1, visited, calleeImports, calleeFilePath);
      }
    }
  }

  // 開始: User -> System (ツール呼び出し)
  const toolDesc = tool.description || tool.name;
  steps.push({
    from: "User",
    to: "System",
    action: toolDesc.length > 60 ? toolDesc.substring(0, 57) + "..." : toolDesc,
    isAsync: true,
  });

  // execute関数内の呼び出しから追跡開始
  if (tool.executeCalls && tool.executeCalls.length > 0) {
    // executeCallsから直接ステップを生成
    traceCallNodes(tool.executeCalls, "System", 1, new Set(), imports, currentFilePath);
  } else if (tool.executeFunction) {
    // 従来の方法（名前付き関数の場合）
    traceCalls(tool.executeFunction, "System", 1, new Set());
  }

  // 終了: System -> User (結果返却)
  steps.push({
    from: "System",
    to: "User",
    action: "結果",
    isAsync: false,
  });

  // User↔System 以外のステップ数をカウント
  const nonBoundarySteps = steps.filter(s => {
    // User→SystemとSystem→User以外のステップ
    return !(s.from === "User" && s.to === "System") && !(s.from === "System" && s.to === "User");
  });

  // 実ステップがない場合は空文字を返す（シーケンス図を生成しない）
  if (nonBoundarySteps.length === 0) {
    return "";
  }

  // Mermaidシーケンス図を生成
  let diagram = "sequenceDiagram\n";
  diagram += "  autonumber\n";

  // 参加者を定義
  for (const [, def] of participants) {
    diagram += `  ${def}\n`;
  }
  diagram += "\n";

  // ステップを生成
  for (const step of steps) {
    const fromId = step.from === "User" ? "User" : sanitizeMermaidIdentifier(step.from);
    const toId = step.to === "User" ? "User" : sanitizeMermaidIdentifier(step.to);
    const escapedAction = step.action.replace(/"/g, "'").replace(/\n/g, " ");

    if (step.to === "User") {
      // 戻り
      diagram += `  ${fromId}-->>${toId}: ${escapedAction}\n`;
    } else if (step.isAsync) {
      diagram += `  ${fromId}->>${toId}: ${escapedAction}\n`;
    } else {
      diagram += `  ${fromId}->>${toId}: ${escapedAction}\n`;
    }
  }

  return diagram;
}

/**
 * ユーザーフローセクションを生成
 */
function generateUserFlowSection(info: FileInfo, currentFilePath: string): string {
  if (info.tools.length === 0) return "";

  let section = `## ユーザーフロー

このモジュールが提供するツールと、その実行フローを示します。

`;

  // 関数情報をMapに変換
  const allFunctions = new Map<string, FunctionInfo>();
  for (const fn of info.functions) {
    allFunctions.set(fn.name, fn);
  }

  for (const tool of info.tools) {
    const sequenceDiagram = generateUserSequence(
      tool, 
      allFunctions, 
      info.calls, 
      info.imports,
      currentFilePath,
      4 // maxDepth
    );

    section += `### ${tool.name}

${tool.description}
`;

    // シーケンス図がある場合のみmermaidブロックを追加
    if (sequenceDiagram.trim()) {
      section += `
\`\`\`mermaid
${sequenceDiagram}
\`\`\`
`;
    }

    section += "\n";
  }

  return section;
}

// ============================================================================
// Markdown Generation
// ============================================================================

function generateMarkdown(info: FileInfo): string {
  const date = new Date().toISOString().split('T')[0];
  const title = basename(info.relativePath).replace(/\.ts$/, '');

  let md = `---
title: ${title}
category: api-reference
audience: developer
last_updated: ${date}
tags: [auto-generated]
related: []
---

# ${title}

`;

  // 概要
  md += `## 概要

\`${title}\` モジュールのAPIリファレンス。

`;

  // インポート
  if (info.imports.length > 0) {
    md += `## インポート

\`\`\`typescript
`;
    for (const imp of info.imports.slice(0, 5)) {
      if (imp.bindings.length > 0) {
        const preview = imp.bindings
          .slice(0, 3)
          .map(b => b.localName)
          .join(', ');
        md += `// from '${imp.source}': ${preview}${imp.bindings.length > 3 ? ', ...' : ''}\n`;
      } else {
        md += `import '${imp.source}';\n`;
      }
    }
    if (info.imports.length > 5) {
      md += `// ... and ${info.imports.length - 5} more imports\n`;
    }
    md += `\`\`\`\n\n`;
  }

  // エクスポート概要
  const exportedFunctions = info.functions.filter(f => f.isExported);
  const exportedClasses = info.classes.filter(c => c.isExported);
  const exportedInterfaces = info.interfaces.filter(i => i.isExported);
  const exportedTypes = info.types.filter(t => t.isExported);

  md += `## エクスポート一覧

| 種別 | 名前 | 説明 |
|------|------|------|
`;

  for (const fn of exportedFunctions) {
    const desc = fn.jsDoc ? fn.jsDoc.split('\n')[0].substring(0, 50) : '-';
    md += `| 関数 | \`${fn.name}\` | ${desc} |\n`;
  }
  for (const cls of exportedClasses) {
    const desc = cls.jsDoc ? cls.jsDoc.split('\n')[0].substring(0, 50) : '-';
    md += `| クラス | \`${cls.name}\` | ${desc} |\n`;
  }
  for (const intf of exportedInterfaces) {
    const desc = intf.jsDoc ? intf.jsDoc.split('\n')[0].substring(0, 50) : '-';
    md += `| インターフェース | \`${intf.name}\` | ${desc} |\n`;
  }
  for (const t of exportedTypes) {
    const desc = t.jsDoc ? t.jsDoc.split('\n')[0].substring(0, 50) : '-';
    md += `| 型 | \`${t.name}\` | ${desc} |\n`;
  }

  md += '\n';

  // ユーザーフロー（ツールがある場合）
  md += generateUserFlowSection(info, info.path);

  // Mermaid図
  md += generateMermaidSection(info);

  // 関数詳細
  if (info.functions.length > 0) {
    md += `## 関数

`;
    for (const fn of info.functions) {
      md += `### ${fn.name}

\`\`\`typescript
${fn.signature}
\`\`\`

`;
      if (fn.jsDoc) {
        md += `${fn.jsDoc}\n\n`;
      }
      if (fn.parameters.length > 0) {
        md += `**パラメータ**\n\n| 名前 | 型 | 必須 |\n|------|-----|------|\n`;
        for (const p of fn.parameters) {
          const formatted = formatTypeForDisplay(p.type);
          if (formatted.isInlineObject && formatted.properties) {
            // インラインオブジェクト型: 親パラメータを表示してから展開
            md += `| ${p.name} | \`object\` | ${p.optional ? 'いいえ' : 'はい'} |\n`;
            for (const prop of formatted.properties) {
              md += `| &nbsp;&nbsp;↳ ${prop.name} | \`${prop.type}\` | ${prop.optional ? 'いいえ' : 'はい'} |\n`;
            }
          } else {
            md += `| ${p.name} | \`${formatted.display}\` | ${p.optional ? 'いいえ' : 'はい'} |\n`;
          }
        }
        md += '\n';
      }
      md += `**戻り値**: \`${fn.returnType}\`\n\n`;
    }
  }

  // クラス詳細
  if (info.classes.length > 0) {
    md += `## クラス

`;
    for (const cls of info.classes) {
      md += `### ${cls.name}

`;
      if (cls.jsDoc) {
        md += `${cls.jsDoc}\n\n`;
      }
      if (cls.extends) {
        md += `**継承**: \`${cls.extends}\`\n\n`;
      }
      if (cls.properties.length > 0) {
        md += `**プロパティ**\n\n| 名前 | 型 | 可視性 |\n|------|-----|--------|\n`;
        for (const p of cls.properties) {
          md += `| ${p.name} | \`${p.type}\` | ${p.visibility} |\n`;
        }
        md += '\n';
      }
      if (cls.methods.length > 0) {
        md += `**メソッド**\n\n| 名前 | シグネチャ |\n|------|------------|\n`;
        for (const m of cls.methods) {
          md += `| ${m.name} | \`${m.signature}\` |\n`;
        }
        md += '\n';
      }
    }
  }

  // インターフェース詳細
  if (info.interfaces.length > 0) {
    md += `## インターフェース

`;
    for (const intf of info.interfaces) {
      md += `### ${intf.name}

\`\`\`typescript
interface ${intf.name} {
`;
      for (const p of intf.properties) {
        md += `  ${p.name}${p.optional ? '?' : ''}: ${p.type};\n`;
      }
      for (const m of intf.methods) {
        md += `  ${m.signature};\n`;
      }
      md += `}
\`\`\`

`;
      if (intf.jsDoc) {
        md += `${intf.jsDoc}\n\n`;
      }
    }
  }

  // 型詳細
  if (info.types.length > 0) {
    md += `## 型定義

`;
    for (const t of info.types) {
      md += `### ${t.name}

\`\`\`typescript
type ${t.name} = ${t.definition}
\`\`\`

`;
      if (t.jsDoc) {
        md += `${t.jsDoc}\n\n`;
      }
    }
  }

  // メタデータ
  md += `---
*自動生成: ${new Date().toISOString()}*
`;

  return md;
}

// ============================================================================
// Mermaid Generation
// ============================================================================

function sanitizeMermaidType(type: string): string {
  // 型をMermaidクラス図で表示可能な形式に短縮
  let sanitized = type
    .replace(/import\("[^"]+"\)\./g, '')
    .replace(/\s+/g, '')
    // 長い型を短縮
    .substring(0, 20);

  // 特殊文字を削除し、英数字とアンダースコアのみ残す
  sanitized = sanitized.replace(/[^a-zA-Z0-9_]/g, '_');

  // 連続するアンダースコアを1つに
  sanitized = sanitized.replace(/_+/g, '_');

  // 先頭と末尾のアンダースコアを削除
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  // 先頭が数字の場合はアンダースコアを追加
  if (/^[0-9]/.test(sanitized)) {
    sanitized = 'T' + sanitized;
  }

  return sanitized || 'any';
}

function sanitizeMermaidIdentifier(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  // 連続するアンダースコアを1つに
  sanitized = sanitized.replace(/_+/g, '_');
  // 先頭と末尾のアンダースコアを削除
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  // 先頭が数字の場合はプレフィックスを追加
  if (/^[0-9]/.test(sanitized)) {
    sanitized = 'N' + sanitized;
  }
  // 空の場合はプレースホルダー
  sanitized = sanitized || 'Unknown';

  // Mermaid予約語を回避
  const reservedWords = ['loop', 'alt', 'opt', 'par', 'and', 'or', 'end', 'else', 'note', 'participant', 'actor', 'activate', 'deactivate'];
  if (reservedWords.includes(sanitized.toLowerCase())) {
    sanitized = 'M' + sanitized;
  }

  return sanitized;
}

function buildActualFunctionFlowDiagram(info: FileInfo, maxNodes: number = 24, maxEdges: number = 40, maxDepth: number = 5): string {
  const exportedRoots = info.functions.filter(f => f.isExported).map(f => f.name);
  if (exportedRoots.length === 0) {
    return '';
  }

  const localFunctions = new Set(info.functions.map(f => f.name));
  const nodes = new Set<string>();
  const edges = new Set<string>();

  const queue: Array<{ name: string; depth: number }> = exportedRoots.map(name => ({ name, depth: 0 }));
  const visitedByDepth = new Set<string>();

  while (queue.length > 0 && nodes.size < maxNodes && edges.size < maxEdges) {
    const current = queue.shift();
    if (!current) break;
    const visitKey = `${current.name}@${current.depth}`;
    if (visitedByDepth.has(visitKey)) continue;
    visitedByDepth.add(visitKey);
    nodes.add(current.name);

    if (current.depth >= maxDepth) continue;
    const outgoing = info.calls.get(current.name) || [];
    for (const call of outgoing) {
      if (!localFunctions.has(call.callee)) continue;
      nodes.add(call.callee);
      edges.add(`${current.name}-->${call.callee}`);
      queue.push({ name: call.callee, depth: current.depth + 1 });
      if (nodes.size >= maxNodes || edges.size >= maxEdges) break;
    }
  }

  if (edges.size === 0) {
    return '';
  }

  const sortedNodes = [...nodes].sort();
  const sortedEdges = [...edges].sort();
  let diagram = `flowchart TD\n`;
  for (const node of sortedNodes) {
    diagram += `  ${sanitizeMermaidIdentifier(node)}["${node}()"]\n`;
  }
  for (const edge of sortedEdges) {
    const [from, to] = edge.split('-->');
    diagram += `  ${sanitizeMermaidIdentifier(from)} --> ${sanitizeMermaidIdentifier(to)}\n`;
  }
  return diagram;
}

function generateMermaidSection(info: FileInfo): string {
  let section = `## 図解

`;

  // クラス図
  if (info.classes.length > 0 || info.interfaces.length > 0) {
    section += `### クラス図

\`\`\`mermaid
classDiagram
`;
    for (const cls of info.classes) {
      const clsName = sanitizeMermaidIdentifier(cls.name);
      section += `  class ${clsName} {\n`;
      for (const p of cls.properties.slice(0, 5)) {
        const vis = p.visibility === 'private' ? '-' : p.visibility === 'protected' ? '#' : '+';
        const typeName = sanitizeMermaidType(p.type);
        section += `    ${vis}${sanitizeMermaidIdentifier(p.name)}: ${typeName}\n`;
      }
      for (const m of cls.methods.slice(0, 5)) {
        const vis = m.visibility === 'private' ? '-' : m.visibility === 'protected' ? '#' : '+';
        section += `    ${vis}${sanitizeMermaidIdentifier(m.name)}()\n`;
      }
      section += `  }\n`;
      if (cls.extends) {
        section += `  ${sanitizeMermaidIdentifier(cls.extends)} <|-- ${clsName}\n`;
      }
    }

    for (const intf of info.interfaces) {
      const intfName = sanitizeMermaidIdentifier(intf.name);
      section += `  class ${intfName} {\n`;
      section += `    <<interface>>\n`;
      for (const p of intf.properties.slice(0, 5)) {
        const typeName = sanitizeMermaidType(p.type);
        section += `    +${sanitizeMermaidIdentifier(p.name)}: ${typeName}\n`;
      }
      section += `  }\n`;
    }

    section += `\`\`\`\n\n`;
  }

  // 依存関係図（インポートがある場合）
  if (info.imports.length > 0) {
    const localImports = info.imports.filter(i => i.source.startsWith('.'));
    const externalImports = info.imports.filter(i => !i.source.startsWith('.') && !i.source.startsWith('node:'));

    if (localImports.length > 0 || externalImports.length > 0) {
      section += `### 依存関係図

\`\`\`mermaid
flowchart LR
  subgraph this[${basename(info.relativePath, '.ts')}]
    main[Main Module]
  end
`;

      if (localImports.length > 0) {
        section += `  subgraph local[ローカルモジュール]\n`;
        for (const imp of localImports.slice(0, 5)) {
          // .js拡張子を削除
          let name = basename(imp.source).replace(/\.js$/, '');
          const nodeId = sanitizeMermaidIdentifier(name);
          section += `    ${nodeId}["${name}"]\n`;
        }
        section += `  end\n`;
        section += `  main --> local\n`;
      }

      if (externalImports.length > 0) {
        section += `  subgraph external[外部ライブラリ]\n`;
        for (const imp of externalImports.slice(0, 5)) {
          const name = imp.source.split('/')[0];
          // ラベルをダブルクオートで囲み、特殊文字をエスケープ
          const escapedName = name.replace(/"/g, "'");
          section += `    ${name.replace(/[^a-zA-Z0-9]/g, '_')}["${escapedName}"]\n`;
        }
        section += `  end\n`;
        section += `  main --> external\n`;
      }

      section += `\`\`\`\n\n`;
    }
  }

  // 関数呼び出しフロー（実コールエッジのみ）
  if (info.functions.length > 1) {
    const flowDiagram = buildActualFunctionFlowDiagram(info);
    if (flowDiagram.trim()) {
      section += `### 関数フロー

\`\`\`mermaid
${flowDiagram}\`\`\`\n\n`;
    }
  }

  // シーケンス図（非同期処理やAPI呼び出しがある場合）
  const asyncFunctions = info.functions.filter(f => f.isAsync);
  const exportedFunctions = info.functions.filter(f => f.isExported);

  if (asyncFunctions.length > 0 || (exportedFunctions.length >= 2 && info.imports.length > 0)) {
    section += `### シーケンス図

\`\`\`mermaid
sequenceDiagram
  autonumber
`;
    // 参加者を定義
    section += `  participant Caller as 呼び出し元\n`;

    // メインモジュール
    const moduleName = basename(info.relativePath, '.ts');
    const modId = sanitizeMermaidIdentifier(moduleName);
    section += `  participant ${modId} as "${moduleName}"\n`;

    // 外部依存（一意なパッケージのみ）
    const uniqueExternalDeps = [...new Set(
      info.imports
        .filter(i => !i.source.startsWith('.') && !i.source.startsWith('node:'))
        .map(i => i.source.split('/')[0])
    )].slice(0, 3);

    const externalDepIds: string[] = [];
    for (const dep of uniqueExternalDeps) {
      const depId = sanitizeMermaidIdentifier(dep);
      const escapedDep = dep.replace(/"/g, "'");
      section += `  participant ${depId} as "${escapedDep}"\n`;
      externalDepIds.push(depId);
    }

    // ローカル依存
    const localDeps = info.imports.filter(i => i.source.startsWith('.')).slice(0, 2);
    const localDepIds: string[] = [];
    for (const dep of localDeps) {
      const depName = basename(dep.source).replace(/\.js$/, '');
      const depId = sanitizeMermaidIdentifier(depName);
      section += `  participant ${depId} as "${depName}"\n`;
      localDepIds.push(depId);
    }

    section += `\n`;

    // メインフロー
    const mainFn = exportedFunctions[0];
    if (mainFn) {
      // 呼び出し元→メイン関数
      section += `  Caller->>${modId}: ${mainFn.name}()\n`;

      // 非同期の場合
      if (mainFn.isAsync) {
        section += `  activate ${modId}\n`;
        section += `  Note over ${modId}: 非同期処理開始\n`;
      }

      // 外部依存への呼び出し
      if (externalDepIds.length > 0) {
        const firstDepId = externalDepIds[0];
        section += `  ${modId}->>${firstDepId}: API呼び出し\n`;
        section += `  ${firstDepId}-->>${modId}: レスポンス\n`;
      }

      // ローカル依存への呼び出し
      if (localDepIds.length > 0) {
        const localId = localDepIds[0];
        section += `  ${modId}->>${localId}: 内部関数呼び出し\n`;
        section += `  ${localId}-->>${modId}: 結果\n`;
      }

      // 戻り
      if (mainFn.isAsync) {
        section += `  deactivate ${modId}\n`;
      }
      const mainReturnType = sanitizeMermaidType(mainFn.returnType || 'Result');
      section += `  ${modId}-->>Caller: ${mainReturnType}\n`;
    }

    // 2つ目のエクスポート関数がある場合
    if (exportedFunctions.length > 1) {
      const secondFn = exportedFunctions[1];

      section += `\n`;
      section += `  Caller->>${modId}: ${secondFn.name}()\n`;

      if (secondFn.isAsync) {
        section += `  activate ${modId}\n`;
      }

      const secondReturnType = sanitizeMermaidType(secondFn.returnType || 'Result');
      section += `  ${modId}-->>Caller: ${secondReturnType}\n`;

      if (secondFn.isAsync) {
        section += `  deactivate ${modId}\n`;
      }
    }

    section += `\`\`\`\n\n`;
  }

  return section;
}

// ============================================================================
// Mermaid Validation
// ============================================================================

interface MermaidError {
  file: string;
  line: number;
  diagram: string;
  error: string;
}

/**
 * Mermaid図を並列検証
 */
async function validateAllMermaidDiagrams(): Promise<MermaidError[]> {
  const errors: MermaidError[] = [];
  const mdFiles = collectMarkdownFiles(ABDD_DIR);

  console.log('\n=== Validating Mermaid diagrams (parallel) ===\n');

  // すべてのブロックを先に収集
  interface BlockInfo {
    file: string;
    line: number;
    code: string;
  }

  const allBlocks: BlockInfo[] = [];
  for (const file of mdFiles) {
    const content = readFileSync(file, 'utf-8');
    const mermaidBlocks = extractMermaidBlocks(content);
    for (const block of mermaidBlocks) {
      allBlocks.push({
        file: relative(ROOT_DIR, file),
        line: block.line,
        code: block.code,
      });
    }
  }

  console.log(`  Total diagrams to validate: ${allBlocks.length}`);
  console.log(`  Parallel limit: ${MERMAID_PARALLEL_LIMIT}\n`);

  let validCount = 0;
  let errorCount = 0;

  // 並列数を制限して検証
  const batchSize = MERMAID_PARALLEL_LIMIT;
  for (let i = 0; i < allBlocks.length; i += batchSize) {
    const batch = allBlocks.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (block) => {
        const validation = await validateMermaidAsync(block.code);
        return { block, validation };
      })
    );

    for (const { block, validation } of results) {
      if (!validation.valid) {
        errorCount++;
        errors.push({
          file: block.file,
          line: block.line,
          diagram: block.code.substring(0, 100) + '...',
          error: validation.error || 'Unknown error',
        });
        console.log(`  ❌ ${block.file}:${block.line} - ${validation.error}`);
      } else {
        validCount++;
      }
    }

    // 進捗表示
    const processed = Math.min(i + batchSize, allBlocks.length);
    if (processed % (batchSize * 5) === 0 || processed === allBlocks.length) {
      console.log(`  Progress: ${processed}/${allBlocks.length} (${validCount} valid, ${errorCount} errors)`);
    }
  }

  console.log(`\n📊 Results: ${validCount}/${allBlocks.length} diagrams valid`);

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} errors found:\n`);
    for (const err of errors) {
      console.log(`  ${err.file}:${err.line}`);
      console.log(`    ${err.error}\n`);
    }
  } else {
    console.log('\n✅ All Mermaid diagrams are valid!\n');
  }

  return errors;
}

function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(path: string) {
    const entries = readdirSync(path);
    for (const entry of entries) {
      const fullPath = join(path, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && entry.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function extractMermaidBlocks(content: string): { code: string; line: number }[] {
  const blocks: { code: string; line: number }[] = [];
  const lines = content.split('\n');

  let inMermaid = false;
  let currentBlock: string[] = [];
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === '```mermaid') {
      inMermaid = true;
      startLine = i + 1;
      currentBlock = [];
    } else if (inMermaid && line.trim() === '```') {
      inMermaid = false;
      if (currentBlock.length > 0) {
        blocks.push({
          code: currentBlock.join('\n'),
          line: startLine,
        });
      }
    } else if (inMermaid) {
      currentBlock.push(line);
    }
  }

  return blocks;
}

function validateMermaid(code: string): { valid: boolean; error?: string } {
  // mmdcがインストールされているかチェック
  try {
    execSync('which mmdc', { stdio: 'pipe' });
  } catch {
    // mmdcがない場合は簡易チェック
    return validateMermaidSimple(code);
  }

  // 同期版は非推奨（並列検証にはvalidateMermaidAsyncを使用）
  return validateMermaidSimple(code);
}

/**
 * Mermaid図を非同期で検証（並列実行用）
 */
async function validateMermaidAsync(code: string): Promise<{ valid: boolean; error?: string }> {
  // 簡易チェックを先に実行
  const simpleResult = validateMermaidSimple(code);
  if (!simpleResult.valid) {
    return simpleResult;
  }

  // mmdcがインストールされているかチェック
  try {
    await execAsync('which mmdc', { timeout: 5000 });
  } catch {
    // mmdcがない場合は簡易チェックの結果を返す
    return { valid: true };
  }

  // 一時ファイルに書き出してmmdcで検証
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'mermaid-'));
  const tmpFile = join(tmpDir, 'diagram.mmd');
  const tmpOutput = join(tmpDir, 'output.svg');

  try {
    writeFileSync(tmpFile, code, 'utf-8');

    // mmdcで検証（SVGを出力して成功するか確認）
    await execAsync(`mmdc -i "${tmpFile}" -o "${tmpOutput}" -b transparent`, {
      timeout: MERMAID_TIMEOUT_MS,
    });

    return { valid: true };
  } catch (error) {
    let errorMsg = 'Parse error';

    if (error instanceof Error) {
      const anyError = error as any;
      if (anyError.stderr) {
        errorMsg = anyError.stderr.toString();
      } else if (anyError.stdout) {
        errorMsg = anyError.stdout.toString();
      } else {
        errorMsg = error.message;
      }
    }

    const lines = errorMsg.split('\n');
    let cleanError = lines.find((l: string) =>
      l.includes('Error') || l.includes('error') || l.includes('Parse')
    ) || lines[0] || 'Parse error';
    cleanError = cleanError.substring(0, 150).trim();

    if (cleanError.includes('Command failed') || cleanError.length < 5) {
      cleanError = 'Parse error';
    }

    return { valid: false, error: cleanError };
  } finally {
    try {
      rmSync(tmpDir, { recursive: true });
    } catch {
      // 無視
    }
  }
}

function validateMermaidSimple(code: string): { valid: boolean; error?: string } {
  // 簡易的な構文チェック（mmdcがない場合）

  // 空のブロック
  if (!code.trim()) {
    return { valid: false, error: 'Empty diagram' };
  }

  // 図の種類を判定
  const firstLine = code.split('\n')[0].trim();

  const validTypes = ['flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'mindmap', 'timeline', 'quadrantChart', 'requirementDiagram', 'gitGraph'];

  // 図の種類が正しいかチェック
  const hasValidType = validTypes.some(type => firstLine.startsWith(type));

  if (!hasValidType) {
    return { valid: false, error: `Invalid diagram type: ${firstLine}` };
  }

  // 基本的な構文エラーチェック
  const lines = code.split('\n');

  // 未閉じの引用符チェック
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const doubleQuotes = (line.match(/"/g) || []).length;
    if (doubleQuotes % 2 !== 0) {
      // エスケープされた引用符を考慮
      const escapedQuotes = (line.match(/\\"/g) || []).length;
      if ((doubleQuotes - escapedQuotes) % 2 !== 0) {
        return { valid: false, error: `Unmatched quotes on line ${i + 1}` };
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * インラインオブジェクト型をパースしてプロパティを抽出する
 * 例: "{ a: number; b?: string }" => [{ name: "a", type: "number", optional: false }, ...]
 */
function parseInlineObjectType(typeStr: string): { name: string; type: string; optional: boolean }[] | null {
  const trimmed = typeStr.trim();
  
  // オブジェクト型でない場合はnullを返す
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }
  
  // 中身を抽出
  let content = trimmed.slice(1, -1).trim();
  if (!content) return [];
  
  const properties: { name: string; type: string; optional: boolean }[] = [];
  
  // プロパティを解析
  // ネストした型（配列、ジェネリクス、入れ子オブジェクト）を考慮
  let depth = 0;
  let current = '';
  let i = 0;
  
  while (i < content.length) {
    const char = content[i];
    
    if (char === '{' || char === '<' || char === '[' || char === '(') {
      depth++;
      current += char;
    } else if (char === '}' || char === '>' || char === ']' || char === ')') {
      depth--;
      current += char;
    } else if (char === ';' || char === ',') {
      if (depth === 0 && current.trim()) {
        const prop = parseProperty(current.trim());
        if (prop) properties.push(prop);
        current = '';
      } else {
        current += char;
      }
    } else if (char === '\n' || char === '\r') {
      // 改行は区切りとして扱う
      if (depth === 0 && current.trim()) {
        const prop = parseProperty(current.trim());
        if (prop) properties.push(prop);
        current = '';
      }
    } else {
      current += char;
    }
    i++;
  }
  
  // 最後のプロパティ
  if (current.trim()) {
    const prop = parseProperty(current.trim());
    if (prop) properties.push(prop);
  }
  
  return properties.length > 0 ? properties : null;
}

/**
 * 単一のプロパティ定義をパースする
 * 例: "name?: string" => { name: "name", type: "string", optional: true }
 */
function parseProperty(propStr: string): { name: string; type: string; optional: boolean } | null {
  // "propertyName?: type" または "propertyName: type" の形式
  const match = propStr.match(/^\s*(\w+)(\?)?\s*:\s*(.+?)\s*$/);
  if (!match) return null;
  
  return {
    name: match[1],
    optional: match[2] === '?',
    type: match[3].trim(),
  };
}

/**
 * 型文字列を表示用にフォーマットする
 * 長い型は短縮し、インラインオブジェクト型は別途展開用の情報を返す
 */
function formatTypeForDisplay(typeStr: string): { display: string; isInlineObject: boolean; properties?: { name: string; type: string; optional: boolean }[] } {
  const trimmed = typeStr.trim();
  
  // インラインオブジェクト型かチェック
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const properties = parseInlineObjectType(trimmed);
    if (properties && properties.length > 0) {
      return {
        display: 'object',
        isInlineObject: true,
        properties,
      };
    }
  }
  
  // 長い型は短縮
  if (trimmed.length > 50) {
    return {
      display: trimmed.substring(0, 47) + '...',
      isInlineObject: false,
    };
  }
  
  return {
    display: trimmed,
    isInlineObject: false,
  };
}

function collectTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(path: string) {
    const entries = readdirSync(path);
    for (const entry of entries) {
      const fullPath = join(path, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory() && entry !== 'node_modules' && entry !== 'dist') {
        walk(fullPath);
      } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx')) && !entry.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

function mkdirIfNotExists(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Run
main().catch(console.error);
