#!/usr/bin/env npx tsx
/**
 * ABDD Documentation Generator with Mermaid Diagrams
 *
 * TypeScriptソースファイルからAPIドキュメントとMermaid図を自動生成する
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, mkdtempSync, rmSync } from 'fs';
import { join, relative, dirname, basename } from 'path';
import { execSync } from 'child_process';
import * as ts from 'typescript';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

interface FunctionInfo {
  name: string;
  signature: string;
  line: number;
  jsDoc?: string;
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

interface FileInfo {
  path: string;
  relativePath: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  interfaces: InterfaceInfo[];
  types: TypeInfo[];
  imports: { source: string; names: string[] }[];
  exports: string[];
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

async function main() {
  console.log('=== ABDD Documentation Generator ===\n');

  // ABDDディレクトリを作成
  mkdirIfNotExists(join(ABDD_DIR, '.pi/extensions'));
  mkdirIfNotExists(join(ABDD_DIR, '.pi/lib'));

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

  // Mermaid図を検証
  const errors = validateAllMermaidDiagrams();

  if (errors.length > 0) {
    console.log('\n⚠️  Mermaid errors detected. Please fix the generation logic.');
    process.exit(1);
  }

  console.log('\n=== Done ===');
}

// ============================================================================
// File Processing
// ============================================================================

function processFile(filePath: string, baseDir: string, outputDir: string) {
  const relativePath = relative(baseDir, filePath);
  const outputName = relativePath.replace(/\.ts$/, '.md');
  const outputPath = join(outputDir, outputName);

  console.log(`  ${relativePath}`);

  // TypeScriptファイルを解析
  const info = analyzeFile(filePath, baseDir);

  // Markdown を生成
  const markdown = generateMarkdown(info);

  // 出力ディレクトリを作成
  mkdirIfNotExists(dirname(outputPath));

  // ファイルに書き込み
  writeFileSync(outputPath, markdown, 'utf-8');
}

function analyzeFile(filePath: string, baseDir: string): FileInfo {
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
  const types: TypeInfo[] = [];
  const imports: { source: string; names: string[] }[] = [];
  const exports: string[] = [];

  // AST走査
  function visit(node: ts.Node) {
    // インポート
    if (ts.isImportDeclaration(node)) {
      const source = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
      const names: string[] = [];
      if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
        for (const spec of node.importClause.namedBindings.elements) {
          names.push(spec.name.getText(sourceFile));
        }
      }
      if (node.importClause?.name) {
        names.push(node.importClause.name.getText(sourceFile));
      }
      imports.push({ source, names });
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
      const jsDoc = ts.getJSDocCommentsAndTags(node).map(j => (j as ts.JSDoc).comment).filter(Boolean).join('\n');

      functions.push({
        name,
        signature: `${isAsync ? 'async ' : ''}${name}(${params.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')}): ${returnType}`,
        line,
        jsDoc: jsDoc || undefined,
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

        functions.push({
          name,
          signature: `${isAsync ? 'async ' : ''}${name}(${params.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join(', ')}): ${returnType}`,
          line,
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

  return {
    path: filePath,
    relativePath: relative(baseDir, filePath),
    functions,
    classes,
    interfaces,
    types,
    imports,
    exports,
  };
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
      if (imp.names.length > 0) {
        md += `import { ${imp.names.slice(0, 3).join(', ')}${imp.names.length > 3 ? '...' : ''} } from '${imp.source}';\n`;
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
          md += `| ${p.name} | \`${p.type}\` | ${p.optional ? 'いいえ' : 'はい'} |\n`;
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

  // 関数呼び出しフロー（関数がある場合）
  if (info.functions.length > 1) {
    const exportedFns = info.functions.filter(f => f.isExported);
    if (exportedFns.length > 1) {
      section += `### 関数フロー

\`\`\`mermaid
flowchart TD
`;
      for (let i = 0; i < Math.min(exportedFns.length, 6); i++) {
        const fn = exportedFns[i];
        const fnId = sanitizeMermaidIdentifier(fn.name);
        section += `  ${fnId}["${fn.name}()"]\n`;
      }
      // シンプルな順序関係
      for (let i = 0; i < Math.min(exportedFns.length - 1, 5); i++) {
        const from = sanitizeMermaidIdentifier(exportedFns[i].name);
        const to = sanitizeMermaidIdentifier(exportedFns[i + 1].name);
        section += `  ${from} -.-> ${to}\n`;
      }
      section += `\`\`\`\n\n`;
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

function validateAllMermaidDiagrams(): MermaidError[] {
  const errors: MermaidError[] = [];
  const mdFiles = collectMarkdownFiles(ABDD_DIR);

  console.log('\n=== Validating Mermaid diagrams ===\n');

  let totalDiagrams = 0;
  let validDiagrams = 0;

  for (const file of mdFiles) {
    const content = readFileSync(file, 'utf-8');
    const mermaidBlocks = extractMermaidBlocks(content);

    for (let i = 0; i < mermaidBlocks.length; i++) {
      totalDiagrams++;
      const block = mermaidBlocks[i];
      const validation = validateMermaid(block.code);

      if (!validation.valid) {
        errors.push({
          file: relative(ROOT_DIR, file),
          line: block.line,
          diagram: block.code.substring(0, 100) + '...',
          error: validation.error || 'Unknown error',
        });
        console.log(`  ❌ ${relative(ROOT_DIR, file)}:${block.line} - ${validation.error}`);
      } else {
        validDiagrams++;
      }
    }
  }

  console.log(`\n📊 Results: ${validDiagrams}/${totalDiagrams} diagrams valid`);

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

  // 一時ファイルに書き出してmmdcで検証
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'mermaid-'));
  const tmpFile = join(tmpDir, 'diagram.mmd');
  const tmpOutput = join(tmpDir, 'output.svg');

  try {
    writeFileSync(tmpFile, code, 'utf-8');

    // mmdcで検証（SVGを出力して成功するか確認）
    execSync(`mmdc -i "${tmpFile}" -o "${tmpOutput}" -b transparent`, {
      timeout: 15000,
      stdio: 'pipe',
    });

    return { valid: true };
  } catch (error) {
    let errorMsg = 'Parse error';

    if (error instanceof Error) {
      // stdout/stderrからエラーメッセージを抽出
      const anyError = error as any;
      if (anyError.stderr) {
        errorMsg = anyError.stderr.toString();
      } else if (anyError.stdout) {
        errorMsg = anyError.stdout.toString();
      } else {
        errorMsg = error.message;
      }
    }

    // エラーメッセージを簡潔に
    const lines = errorMsg.split('\n');
    let cleanError = lines.find((l: string) =>
      l.includes('Error') || l.includes('error') || l.includes('Parse')
    ) || lines[0] || 'Parse error';
    cleanError = cleanError.substring(0, 150).trim();

    // 一般的なエラーだけを表示
    if (cleanError.includes('Command failed') || cleanError.length < 5) {
      cleanError = 'Parse error';
    }

    return { valid: false, error: cleanError };
  } finally {
    // 一時ファイルを削除
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
