/**
 * AST Structure Extractor
 *
 * TypeScript Compiler APIを使用してソースコードから構造データを抽出
 */

import * as ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import { minimatch } from 'minimatch';

// ============================================================================
// Types
// ============================================================================

 /**
  * 構造抽出オプション
  * @param targetPath 解析対象パス（ファイルまたはディレクトリ）
  * @param excludePatterns 除外パターン（glob形式）
  */
export interface ExtractOptions {
  /** 解析対象パス（ファイルまたはディレクトリ） */
  targetPath: string;
  /** 除外パターン（glob形式） */
  excludePatterns?: string[];
}

 /**
  * 関数の構造情報を表すインターフェース
  */
export interface FunctionInfo {
  /** 関数名 */
  name: string;
  /** 完全なシグネチャ */
  signature: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  line: number;
  /** JSDocコメント */
  jsDoc?: string;
  /** パラメータ */
  parameters: ParameterInfo[];
  /** 戻り値の型 */
  returnType: string;
  /** 非同期関数かどうか */
  isAsync: boolean;
  /** エクスポートされているか */
  isExported: boolean;
}

 /**
  * 関数のパラメータ情報
  * @param name パラメータ名
  * @param type 型
  * @param optional 省略可能か
  * @param defaultValue デフォルト値
  */
export interface ParameterInfo {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

 /**
  * クラスの構造情報を表します。
  * @param name クラス名
  * @param filePath ファイルパス
  * @param line 行番号
  * @param jsDoc JSDocコメント
  * @param methods メソッド一覧
  * @param properties プロパティ一覧
  * @param extends 継承元クラス
  * @param implements 実装インターフェース
  */
export interface ClassInfo {
  /** クラス名 */
  name: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  line: number;
  /** JSDocコメント */
  jsDoc?: string;
  /** メソッド一覧 */
  methods: MethodInfo[];
  /** プロパティ一覧 */
  properties: PropertyInfo[];
  /** 継承元クラス */
  extends?: string;
  /** 実装インターフェース */
  implements: string[];
  /** エクスポートされているか */
  isExported: boolean;
}

 /**
  * メソッドの構造情報
  * @param name メソッド名
  * @param signature シグネチャ
  * @param parameters パラメータ情報の配列
  * @param returnType 戻り値の型
  * @param isAsync 非同期メソッドかどうか
  * @param isStatic 静的メソッドかどうか
  * @param visibility 可視性
  * @param jsDoc JSDocコメント
  */
export interface MethodInfo {
  name: string;
  signature: string;
  parameters: ParameterInfo[];
  returnType: string;
  isAsync: boolean;
  isStatic: boolean;
  visibility: 'public' | 'protected' | 'private';
  jsDoc?: string;
}

 /**
  * プロパティの情報を表すインターフェース
  * @param name プロパティ名
  * @param type プロパティの型
  * @param visibility 可視性（'public' | 'protected' | 'private'）
  * @param isStatic 静的プロパティかどうか
  * @param isReadonly 読み取り専用かどうか
  * @param jsDoc ドキュメントコメント（省略可）
  */
export interface PropertyInfo {
  name: string;
  type: string;
/**
   * インターフェースの構造情報を表す型定義
   *
   * コード解析時に抽出されたインターフェースのメタデータを格納する。
   * インターフェース名、ファイル位置、プロパティ、メソッド、継承関係などの情報を含む。
   */
  visibility: 'public' | 'protected' | 'private';
  isStatic: boolean;
  isReadonly: boolean;
  jsDoc?: string;
}

 /**
  * インターフェースの構造情報
  * @param name インターフェース名
  * @param filePath ファイルパス
  * @param line 行番号
  * @param jsDoc JSDocコメント
  * @param properties プロパティ一覧
  * @param methods メソッド一覧
  * @param extends 継承元インターフェース
  */
export interface InterfaceInfo {
  /** インターフェース名 */
  name: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  line: number;
  /** JSDocコメント */
  jsDoc?: string;
  /** プロパティ一覧 */
  properties: InterfacePropertyInfo[];
  /** メソッド一覧 */
  methods: InterfaceMethodInfo[];
  /** 継承元インターフェース */
  extends: string[];
  /** エクスポートされているか */
  isExported: boolean;
}

 /**
  * インターフェースプロパティの情報
  * @property name - プロパティ名
  * @property type - 型情報
  * @property optional - オプションプロパティかどうか
  * @property isReadonly - 読み取り専用かどうか
  * @property jsDoc - JSDocコメント
  */
export interface InterfacePropertyInfo {
  name: string;
  type: string;
/**
   * インポート文の構造情報を表すインターフェース
   *
   * コード解析時に抽出されたimport文の詳細情報を保持します。
   *
   * @property source - インポート元モジュールのパス
   * @property names - インポート対象の名前一覧
   * @property filePath - インポート文が存在するファイルパス
   * @property line - インポート文の行番号
   * @property isDefault - デフォルトインポートの場合true
   * @property isNamespace - 名前空間インポートの場合true
   */
  optional: boolean;
  isReadonly: boolean;
  jsDoc?: string;
/**
 * エクスポート情報を表すインターフェース
 *
 * ファイル内のエクスポート宣言に関する情報を保持する。
 * 再エクスポートの場合はsourceプロパティに元のモジュールパスが格納される。
 *
 * @example
 * const exportInfo: ExportInfo = {
 *   name: 'MyComponent',
 *   filePath: '/src/components/index.ts',
 *   line: 5,
 *   isDefault: true
 * };
 */
}

 /**
  * インターフェースメソッド情報
  * @param name メソッド名
  * @param signature シグネチャ
  * @param parameters パラメータ情報一覧
  * @param returnType 戻り値の型
  */
export interface InterfaceMethodInfo {
  name: string;
  signature: string;
  parameters: ParameterInfo[];
  returnType: string;
}

 /**
  * インポート情報
  * @param source インポート元モジュール
  * @param names インポート名一覧
  * @param filePath ファイルパス
  * @param line 行番号
  * @param isDefault デフォルトインポートかどうか
  * @param isNamespace 名前空間インポートかどうか
  */
export interface ImportInfo {
  /** インポート元モジュール */
  source: string;
  /** インポート名一覧 */
  names: string[];
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  line: number;
  /** デフォルトインポートかどうか */
  isDefault: boolean;
  /** 名前空間インポートかどうか */
  isNamespace: boolean;
}

 /**
  * エクスポート情報
  * @param name エクスポート名
  * @param source エクスポート元（再エクスポートの場合）
  * @param filePath ファイルパス
  * @param line 行番号
  * @param isDefault デフォルトエクスポートかどうか
  */
export interface ExportInfo {
  /** エクスポート名 */
  name: string;
  /** エクスポート元（再エクスポートの場合） */
  source?: string;
  /** ファイルパス */
  filePath: string;
  /** 行番号 */
  line: number;
  /** デフォルトエクスポートかどうか */
  isDefault: boolean;
}

 /**
  * ファイル構造を表すインターフェース
  * @param filePath - ファイルパス
  * @param relativePath - 相対パス
  * @param functions - 関数一覧
  * @param classes - クラス一覧
  * @param interfaces - インターフェース一覧
  */
export interface FileStructure {
  /** ファイルパス */
  filePath: string;
  /** 相対パス */
  relativePath: string;
  /** 関数一覧 */
  functions: FunctionInfo[];
  /** クラス一覧 */
  classes: ClassInfo[];
  /** インターフェース一覧 */
  interfaces: InterfaceInfo[];
/**
   * /**
   * * コード構造を抽出し、依存関係を解析する
   * *
   * * 指定されたパスからTypeScriptファイルを収集し、ファイル間の依存関係を
   * * ノードとエッジの形式で返します。
   * *
   * * @param options - 抽出オプ
   */
  /** インポート一覧 */
  imports: ImportInfo[];
  /** エクスポート一覧 */
  exports: ExportInfo[];
}

 /**
  * コード構造解析データの全体像
  * @param basePath - 解析対象のベースパス
  * @param analyzedAt - 解析日時
  * @param files - ファイル構造一覧
  * @param functions - 全関数一覧（集計）
  * @param classes - 全クラス一覧（集計）
  * @param interfaces - 全インターフェース一覧（集計）
  * @param imports - 全インポート一覧（集計）
  * @param exports - 全エクスポート一覧（集計）
  */
export interface StructureData {
  /** 解析対象のベースパス */
  basePath: string;
  /** 解析日時 */
  analyzedAt: string;
  /** ファイル構造一覧 */
  files: FileStructure[];
  /** 全関数一覧（集計） */
  functions: FunctionInfo[];
  /** 全クラス一覧（集計） */
  classes: ClassInfo[];
  /** 全インターフェース一覧（集計） */
  interfaces: InterfaceInfo[];
  /** 全インポート一覧（集計） */
  imports: ImportInfo[];
  /** 全エクスポート一覧（集計） */
  exports: ExportInfo[];
  /** 依存関係グラフ */
  dependencyGraph: DependencyGraph;
}

/**
 * 依存関係グラフ
 */
export interface DependencyGraph {
  /** ノード（ファイル）一覧 */
  nodes: { id: string; name: string; path: string }[];
  /** エッジ（依存関係）一覧 */
  edges: { from: string; to: string; type: 'import' | 'export' }[];
}

// ============================================================================
// Main Export Function
// ============================================================================

 /**
  * コード構造を抽出する
  * @param options 抽出オプション
  * @returns 抽出された構造データ
  */
export async function extractCodeStructure(options: ExtractOptions): Promise<StructureData> {
  const { targetPath, excludePatterns = [] } = options;

  // 対象ファイル一覧を取得
  const files = collectTypeScriptFiles(targetPath, excludePatterns);

  // 各ファイルを解析
  const fileStructures: FileStructure[] = [];
  for (const file of files) {
    const structure = analyzeFile(file, targetPath);
    fileStructures.push(structure);
  }

  // 集計
  const allFunctions = fileStructures.flatMap(f => f.functions);
  const allClasses = fileStructures.flatMap(f => f.classes);
  const allInterfaces = fileStructures.flatMap(f => f.interfaces);
  const allImports = fileStructures.flatMap(f => f.imports);
  const allExports = fileStructures.flatMap(f => f.exports);

  // 依存関係グラフを構築
  const dependencyGraph = buildDependencyGraph(fileStructures);

  return {
    basePath: targetPath,
    analyzedAt: new Date().toISOString(),
    files: fileStructures,
    functions: allFunctions,
    classes: allClasses,
    interfaces: allInterfaces,
    imports: allImports,
    exports: allExports,
    dependencyGraph,
  };
}

// ============================================================================
// File Collection
// ============================================================================

function collectTypeScriptFiles(basePath: string, excludePatterns: string[]): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      // 除外パターンチェック
      const relativePath = relative(basePath, fullPath);
      if (excludePatterns.some(pattern => minimatch(relativePath, pattern))) {
        continue;
      }

      if (stat.isDirectory()) {
        // node_modules等はスキップ
        if (entry !== 'node_modules' && entry !== 'dist' && entry !== '.git') {
          walk(fullPath);
        }
      } else if (stat.isFile() && (extname(entry) === '.ts' || extname(entry) === '.tsx')) {
        // .d.tsファイルはスキップ
        if (!entry.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    }
  }

  const stat = statSync(basePath);
  if (stat.isDirectory()) {
    walk(basePath);
  } else if (stat.isFile()) {
    files.push(basePath);
  }

  return files;
}

// ============================================================================
// File Analysis
// ============================================================================

function analyzeFile(filePath: string, basePath: string): FileStructure {
  const sourceCode = readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const interfaces: InterfaceInfo[] = [];
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];

  // AST走査
  visitNode(sourceFile, sourceFile, {
    onFunction: (func) => functions.push(func),
    onClass: (cls) => classes.push(cls),
    onInterface: (intf) => interfaces.push(intf),
    onImport: (imp) => imports.push(imp),
    onExport: (exp) => exports.push(exp),
  });

  return {
    filePath,
    relativePath: relative(basePath, filePath),
    functions,
    classes,
    interfaces,
    imports,
    exports,
  };
}

// ============================================================================
// AST Visitor
// ============================================================================

interface VisitorCallbacks {
  onFunction: (func: FunctionInfo) => void;
  onClass: (cls: ClassInfo) => void;
  onInterface: (intf: InterfaceInfo) => void;
  onImport: (imp: ImportInfo) => void;
  onExport: (exp: ExportInfo) => void;
}

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  callbacks: VisitorCallbacks
): void {
  // インポート宣言
  if (ts.isImportDeclaration(node)) {
    callbacks.onImport(extractImport(node, sourceFile));
  }

  // エクスポート宣言
  if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
    callbacks.onExport(extractExport(node, sourceFile));
  }

  // 関数宣言
  if (ts.isFunctionDeclaration(node) && node.name) {
    callbacks.onFunction(extractFunction(node, sourceFile));
  }

  // 矢印関数・関数式（トップレベルの変数宣言内）
  if (ts.isVariableDeclaration(node) && node.initializer) {
    if (
      ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer)
    ) {
      const name = node.name.getText(sourceFile);
      callbacks.onFunction(
        extractFunctionFromExpression(
          name,
          node.initializer,
          node,
          sourceFile
        )
      );
    }
  }

  // クラス宣言
  if (ts.isClassDeclaration(node) && node.name) {
    callbacks.onClass(extractClass(node, sourceFile));
  }

  // インターフェース宣言
  if (ts.isInterfaceDeclaration(node)) {
    callbacks.onInterface(extractInterface(node, sourceFile));
  }

  // 子ノードを再帰的に走査
  ts.forEachChild(node, (child) => visitNode(child, sourceFile, callbacks));
}

// ============================================================================
// Extraction Functions
// ============================================================================

function extractFunction(
  node: ts.FunctionDeclaration,
  sourceFile: ts.SourceFile
): FunctionInfo {
  const name = node.name!.getText(sourceFile);
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const jsDoc = extractJsDoc(node);
  const parameters = extractParameters(node.parameters, sourceFile);
  const returnType = node.type ? node.type.getText(sourceFile) : 'void';
  const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  const signature = buildFunctionSignature(name, parameters, returnType, isAsync);

  return {
    name,
    signature,
    filePath: sourceFile.fileName,
    line,
    jsDoc,
    parameters,
    returnType,
    isAsync,
    isExported,
  };
}

function extractFunctionFromExpression(
  name: string,
  expr: ts.ArrowFunction | ts.FunctionExpression,
  decl: ts.VariableDeclaration,
  sourceFile: ts.SourceFile
): FunctionInfo {
  const line = sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;
  const jsDoc = extractJsDoc(decl.parent.parent); // VariableStatementから取得
  const parameters = extractParameters(expr.parameters, sourceFile);
  const returnType = expr.type ? expr.type.getText(sourceFile) : 'void';
  const isAsync = expr.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;

  // エクスポートチェック（VariableStatementの修飾子）
  const varStmt = decl.parent.parent;
  const isExported = ts.isVariableStatement(varStmt) &&
    (varStmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false);

  const signature = buildFunctionSignature(name, parameters, returnType, isAsync);

  return {
    name,
    signature,
    filePath: sourceFile.fileName,
    line,
    jsDoc,
    parameters,
    returnType,
    isAsync,
    isExported,
  };
}

function extractParameters(
  params: ts.NodeArray<ts.ParameterDeclaration>,
  sourceFile: ts.SourceFile
): ParameterInfo[] {
  return params.map(p => ({
    name: p.name.getText(sourceFile),
    type: p.type ? p.type.getText(sourceFile) : 'any',
    optional: p.questionToken !== undefined,
    defaultValue: p.initializer ? p.initializer.getText(sourceFile) : undefined,
  }));
}

function buildFunctionSignature(
  name: string,
  parameters: ParameterInfo[],
  returnType: string,
  isAsync: boolean
): string {
  const asyncPrefix = isAsync ? 'async ' : '';
  const params = parameters
    .map(p => {
      let param = `${p.name}: ${p.type}`;
      if (p.optional) param = `${p.name}?: ${p.type}`;
      if (p.defaultValue) param = `${p.name}: ${p.type} = ${p.defaultValue}`;
      return param;
    })
    .join(', ');
  return `${asyncPrefix}${name}(${params}): ${returnType}`;
}

function extractClass(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
): ClassInfo {
  const name = node.name!.getText(sourceFile);
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const jsDoc = extractJsDoc(node);
  const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

  // 継承
  const extendsClause = node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword);
  const extendsClass = extendsClause?.types[0]?.getText(sourceFile);

  // 実装
  const implementsClause = node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ImplementsKeyword);
  const implementsInterfaces = implementsClause?.types.map(t => t.getText(sourceFile)) || [];

  // メソッド
  const methods: MethodInfo[] = [];
  const properties: PropertyInfo[] = [];

  for (const member of node.members) {
    if (ts.isMethodDeclaration(member)) {
      methods.push(extractMethod(member, sourceFile));
    } else if (ts.isPropertyDeclaration(member)) {
      properties.push(extractProperty(member, sourceFile));
    }
  }

  return {
    name,
    filePath: sourceFile.fileName,
    line,
    jsDoc,
    methods,
    properties,
    extends: extendsClass,
    implements: implementsInterfaces,
    isExported,
  };
}

function extractMethod(
  node: ts.MethodDeclaration,
  sourceFile: ts.SourceFile
): MethodInfo {
  const name = node.name.getText(sourceFile);
  const jsDoc = extractJsDoc(node);
  const parameters = extractParameters(node.parameters, sourceFile);
  const returnType = node.type ? node.type.getText(sourceFile) : 'void';
  const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
  const isStatic = node.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
  const visibility = extractVisibility(node);
  const signature = buildFunctionSignature(name, parameters, returnType, isAsync);

  return {
    name,
    signature,
    parameters,
    returnType,
    isAsync,
    isStatic,
    visibility,
    jsDoc,
  };
}

function extractProperty(
  node: ts.PropertyDeclaration,
  sourceFile: ts.SourceFile
): PropertyInfo {
  const name = node.name.getText(sourceFile);
  const type = node.type ? node.type.getText(sourceFile) : 'any';
  const jsDoc = extractJsDoc(node);
  const visibility = extractVisibility(node);
  const isStatic = node.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
  const isReadonly = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false;

  return {
    name,
    type,
    visibility,
    isStatic,
    isReadonly,
    jsDoc,
  };
}

function extractVisibility(
  node: ts.MethodDeclaration | ts.PropertyDeclaration
): 'public' | 'protected' | 'private' {
  if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword)) return 'private';
  if (node.modifiers?.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
  return 'public';
}

function extractInterface(
  node: ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile
): InterfaceInfo {
  const name = node.name.getText(sourceFile);
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const jsDoc = extractJsDoc(node);
  const isExported = node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

  // 継承
  const extendsClause = node.heritageClauses?.find(c => c.token === ts.SyntaxKind.ExtendsKeyword);
  const extendsInterfaces = extendsClause?.types.map(t => t.getText(sourceFile)) || [];

  // プロパティとメソッド
  const properties: InterfacePropertyInfo[] = [];
  const methods: InterfaceMethodInfo[] = [];

  for (const member of node.members) {
    if (ts.isPropertySignature(member)) {
      properties.push({
        name: member.name.getText(sourceFile),
        type: member.type ? member.type.getText(sourceFile) : 'any',
        optional: member.questionToken !== undefined,
        isReadonly: member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword) ?? false,
        jsDoc: extractJsDoc(member),
      });
    } else if (ts.isMethodSignature(member)) {
      const params = extractParameters(member.parameters, sourceFile);
      const returnType = member.type ? member.type.getText(sourceFile) : 'void';
      const signature = buildFunctionSignature(
        member.name.getText(sourceFile),
        params,
        returnType,
        false
      );
      methods.push({
        name: member.name.getText(sourceFile),
        signature,
        parameters: params,
        returnType,
      });
    }
  }

  return {
    name,
    filePath: sourceFile.fileName,
    line,
    jsDoc,
    properties,
    methods,
    extends: extendsInterfaces,
    isExported,
  };
}

function extractImport(
  node: ts.ImportDeclaration,
  sourceFile: ts.SourceFile
): ImportInfo {
  const source = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  const names: string[] = [];
  let isDefault = false;
  let isNamespace = false;

  if (node.importClause) {
    if (node.importClause.name) {
      isDefault = true;
      names.push(node.importClause.name.getText(sourceFile));
    }
    if (node.importClause.namedBindings) {
      if (ts.isNamespaceImport(node.importClause.namedBindings)) {
        isNamespace = true;
        names.push(node.importClause.namedBindings.name.getText(sourceFile));
      } else if (ts.isNamedImports(node.importClause.namedBindings)) {
        for (const specifier of node.importClause.namedBindings.elements) {
          names.push(specifier.name.getText(sourceFile));
        }
      }
    }
  }

  return {
    source,
    names,
    filePath: sourceFile.fileName,
    line,
    isDefault,
    isNamespace,
  };
}

function extractExport(
  node: ts.ExportDeclaration | ts.ExportAssignment,
  sourceFile: ts.SourceFile
): ExportInfo {
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

  if (ts.isExportDeclaration(node)) {
    const names: string[] = [];
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const specifier of node.exportClause.elements) {
        names.push(specifier.name.getText(sourceFile));
      }
    }
    return {
      name: names.join(', ') || '*',
      source: node.moduleSpecifier?.getText(sourceFile).replace(/['"]/g, ''),
      filePath: sourceFile.fileName,
      line,
      isDefault: false,
    };
  } else {
    return {
      name: node.expression?.getText(sourceFile) || 'default',
      filePath: sourceFile.fileName,
      line,
      isDefault: true,
    };
  }
}

function extractJsDoc(node: ts.Node): string | undefined {
  const jsDocTags = ts.getJSDocCommentsAndTags(node);
  if (jsDocTags.length === 0) return undefined;

  const comments: string[] = [];
  for (const tag of jsDocTags) {
    if (ts.isJSDoc(tag)) {
      comments.push(tag.comment?.toString() || '');
    }
  }
  return comments.filter(Boolean).join('\n');
}

// ============================================================================
// Dependency Graph
// ============================================================================

function buildDependencyGraph(files: FileStructure[]): DependencyGraph {
  const nodes: DependencyGraph['nodes'] = [];
  const edges: DependencyGraph['edges'] = [];

  // ノード作成
  for (const file of files) {
    nodes.push({
      id: file.relativePath,
      name: file.relativePath.split('/').pop() || file.relativePath,
      path: file.relativePath,
    });
  }

  // エッジ作成（インポート関係）
  for (const file of files) {
    for (const imp of file.imports) {
      // ローカルインポートの場合のみ処理
      if (imp.source.startsWith('.')) {
        // 解決後のパスを推測（簡易実装）
        const fromPath = file.relativePath;
        const toPath = resolveImportPath(fromPath, imp.source);

        edges.push({
          from: fromPath,
          to: toPath,
          type: 'import',
        });
      }
    }
  }

  return { nodes, edges };
}

function resolveImportPath(fromPath: string, importSource: string): string {
  // 簡易的なインポートパス解決
  const fromDir = fromPath.split('/').slice(0, -1).join('/');
  const resolved = join(fromDir, importSource);
  return resolved.replace(/^\.\//, '').replace(/\/\.\//g, '/');
}
