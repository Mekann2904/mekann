/**
 * @abdd.meta
 * path: .pi/extensions/code-structure-analyzer/tools/generate-doc.ts
 * role: ドキュメントセクション生成器
 * why: コード構造データとMermaid図から、LLM解説用プレースホルダを含むドキュメントセクションを統一的に生成するため
 * related: extract-structure.ts, generate-diagrams.ts, DocSections, LLMContext
 * public_api: generateDocSections, DocOptions, DocSections, LLMContext
 * invariants: 入力StructureDataとMermaidDiagramsが非nullの場合、全セクション文字列を返す; includeLLMContext未指定時はllmContextをundefinedとする
 * side_effects: なし（純粋関数として動作）
 * failure_modes: structureまたはdiagramsがnull/undefinedの場合、TypeErrorが発生
 * @abdd.explain
 * overview: 構造データとMermaid図を入力とし、タイトル・概要・構造・API参照・図解セクションを生成するモジュール
 * what_it_does:
 *   - StructureDataからタイトル、概要、APIリファレンス、構造セクションの各文字列を生成
 *   - MermaidDiagramsから図解セクション文字列を生成
 *   - includeLLMContext=true時、主要関数・クラス・インターフェース・依存関係・推奨解説ポイントを含むLLMContextを生成
 *   - 生成結果をDocSectionsオブジェクトとして返却
 * why_it_exists:
 *   - コード解析結果を人間可読なドキュメント形式に変換するため
 *   - LLMによる自動解説生成に必要なコンテキストを提供するため
 *   - ドキュメント生成処理を一元管理し、フォーマットの一貫性を保証するため
 * scope:
 *   in: StructureData（関数・クラス・インターフェース情報）, MermaidDiagrams（生成済み図）, DocOptions（テンプレートパス・LLMコンテキスト含有フラグ）
 *   out: DocSections（title, overview, structure, apiReference, diagrams, llmContext）
 */

/**
 * Document Section Generator
 *
 * 構造データとMermaid図からドキュメントセクションを生成
 * LLM解説用のプレースホルダを含むハイブリッド形式
 */

import type { StructureData, FunctionInfo, ClassInfo, InterfaceInfo } from './extract-structure.js';
import type { MermaidDiagrams } from './generate-diagrams.js';

// ============================================================================
// Types
// ============================================================================

 /**
  * ドキュメント生成のオプション設定
  * @param templatePath テンプレートファイルパス
  * @param includeLLMContext LLM用コンテキストを含めるかどうか
  */
export interface DocOptions {
  /** テンプレートファイルパス */
/**
   * /**
   * * ドキュメントの各セクションを定義するインターフェース
   * *
   * * 生成されるドキュメントの構成要素を表します
   */
  templatePath?: string;
  /** LLM用コンテキストを含める */
  includeLLMContext?: boolean;
}

 /**
  * ドキュメントの各セクションを定義
  * @param title タイトル
  * @param overview 概要セクション（LLM用コンテキスト含む）
  * @param structure 構造セクション
  * @param apiReference APIリファレンスセクション
  * @param diagrams 図解セクション
  * @param llmContext LLM用コンテキストデータ
  */
export interface DocSections {
  /** タイトル */
  title: string;
  /** 概要セクション（LLM用コンテキスト含む） */
  overview: string;
  /** 構造セクション */
  structure: string;
  /** APIリファレンスセクション */
  apiReference: string;
  /** 図解セクション */
  diagrams: string;
  /** LLM用コンテキストデータ */
  llmContext?: LLMContext;
}

 /**
  * LLM用のコンテキスト情報
  * @param summary 解析サマリー
  * @param keyFunctions 主要な関数一覧
  * @param keyClasses 主要なクラス一覧
  * @param keyInterfaces 主要なインターフェース一覧
  * @param dependencies 依存関係情報
  */
export interface LLMContext {
  /** 解析サマリー */
  summary: string;
  /** 主要な関数一覧 */
  keyFunctions: string[];
  /** 主要なクラス一覧 */
  keyClasses: string[];
  /** 主要なインターフェース一覧 */
/**
   * /**
   * * ドキュメントの各セクションを生成する
   * *
   * * コード構造データとMermaidダイアグラムから、タイトル、概要、API参照、
   * * 構造セクション、ダイアグラムセクションを含む完全なドキュメントセクションを生成します。
   * *
   * * @param structure - コ
   */
  keyInterfaces: string[];
  /** 依存関係の概要 */
  dependencies: string[];
  /** 推奨される解説ポイント */
  suggestedExplanationPoints: string[];
}

// ============================================================================
// Main Export Function
// ============================================================================

 /**
  * 構造データからドキュメントセクションを生成する
  * @param structure - 解析された構造データ
  * @param diagrams - 生成されたMermaid図
  * @param options - ドキュメント生成オプション
  * @returns 生成されたドキュメントセクション
  */
export function generateDocSections(
  structure: StructureData,
  diagrams: MermaidDiagrams,
  options: DocOptions
): DocSections {
  const title = generateTitle(structure);
  const overview = generateOverview(structure, options.includeLLMContext);
  const apiReference = generateAPIReference(structure);
  const structureSection = generateStructureSection(structure);
  const diagramsSection = generateDiagramsSection(diagrams);

  let llmContext: LLMContext | undefined;
  if (options.includeLLMContext) {
    llmContext = generateLLMContext(structure);
  }

  return {
    title,
    overview,
    structure: structureSection,
    apiReference,
    diagrams: diagramsSection,
    llmContext,
  };
}

// ============================================================================
// Section Generators
// ============================================================================

function generateTitle(structure: StructureData): string {
  // ベースパスからタイトルを生成
  const baseName = structure.basePath.split('/').pop() || 'API Reference';
  return `${baseName} リファレンス`;
}

function generateOverview(structure: StructureData, includeLLMContext?: boolean): string {
  const lines: string[] = [];

  if (includeLLMContext) {
    lines.push('<!-- LLM解説エリア: 以下に実装の概要を記述してください -->');
    lines.push('');
  }

  // 統計情報
  lines.push('### 統計情報');
  lines.push('');
  lines.push('| 項目 | 数 |');
  lines.push('|------|-----|');
  lines.push(`| ファイル数 | ${structure.files.length} |`);
  lines.push(`| 関数数 | ${structure.functions.length} |`);
  lines.push(`| クラス数 | ${structure.classes.length} |`);
  lines.push(`| インターフェース数 | ${structure.interfaces.length} |`);
  lines.push('');

  // エクスポート一覧
  const exportedFunctions = structure.functions.filter(f => f.isExported);
  const exportedClasses = structure.classes.filter(c => c.isExported);
  const exportedInterfaces = structure.interfaces.filter(i => i.isExported);

  if (exportedFunctions.length > 0 || exportedClasses.length > 0 || exportedInterfaces.length > 0) {
    lines.push('### 公開API');
    lines.push('');

    if (exportedFunctions.length > 0) {
      lines.push('#### 関数');
      lines.push('');
      for (const func of exportedFunctions.slice(0, 10)) {
        lines.push(`- \`${func.name}\``);
      }
      if (exportedFunctions.length > 10) {
        lines.push(`- ... 他 ${exportedFunctions.length - 10} 件`);
      }
      lines.push('');
    }

    if (exportedClasses.length > 0) {
      lines.push('#### クラス');
      lines.push('');
      for (const cls of exportedClasses.slice(0, 10)) {
        lines.push(`- \`${cls.name}\``);
      }
      if (exportedClasses.length > 10) {
        lines.push(`- ... 他 ${exportedClasses.length - 10} 件`);
      }
      lines.push('');
    }

    if (exportedInterfaces.length > 0) {
      lines.push('#### インターフェース');
      lines.push('');
      for (const intf of exportedInterfaces.slice(0, 10)) {
        lines.push(`- \`${intf.name}\``);
      }
      if (exportedInterfaces.length > 10) {
        lines.push(`- ... 他 ${exportedInterfaces.length - 10} 件`);
      }
      lines.push('');
    }
  }

  if (includeLLMContext) {
    lines.push('---');
    lines.push('');
    lines.push('<!-- 以下の点についてLLMによる解説を推奨します -->');
    lines.push('<!-- 1. このモジュールの主な目的と責任 -->');
    lines.push('<!-- 2. 他のモジュールとの関係 -->');
    lines.push('<!-- 3. 使用する際の前提条件 -->');
  }

  return lines.join('\n');
}

function generateStructureSection(structure: StructureData): string {
  const lines: string[] = [];

  // ファイル構造
  lines.push('### ファイル構造');
  lines.push('');
  lines.push('```');
  for (const file of structure.files) {
    const depth = (file.relativePath.match(/\//g) || []).length;
    const indent = '  '.repeat(depth);
    const name = file.relativePath.split('/').pop() || file.relativePath;
    lines.push(`${indent}${name}`);
  }
  lines.push('```');
  lines.push('');

  // 依存関係
  if (structure.imports.length > 0) {
    lines.push('### 外部依存');
    lines.push('');

    const externalDeps = new Set<string>();
    for (const imp of structure.imports) {
      if (!imp.source.startsWith('.') && !imp.source.startsWith('node:')) {
        externalDeps.add(imp.source);
      }
    }

    if (externalDeps.size > 0) {
      for (const dep of Array.from(externalDeps)) {
        lines.push(`- \`${dep}\``);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function generateAPIReference(structure: StructureData): string {
  const lines: string[] = [];

  // 関数リファレンス
  if (structure.functions.length > 0) {
    lines.push('### 関数');
    lines.push('');

    for (const func of structure.functions) {
      lines.push(generateFunctionSection(func));
    }
  }

  // クラスリファレンス
  if (structure.classes.length > 0) {
    lines.push('### クラス');
    lines.push('');

    for (const cls of structure.classes) {
      lines.push(generateClassSection(cls));
    }
  }

  // インターフェースリファレンス
  if (structure.interfaces.length > 0) {
    lines.push('### インターフェース');
    lines.push('');

    for (const intf of structure.interfaces) {
      lines.push(generateInterfaceSection(intf));
    }
  }

  return lines.join('\n');
}

function generateFunctionSection(func: FunctionInfo): string {
  const lines: string[] = [];

  lines.push(`#### \`${func.name}\``);
  lines.push('');
  lines.push('```typescript');
  lines.push(func.signature);
  lines.push('```');
  lines.push('');

  if (func.jsDoc) {
    lines.push(func.jsDoc);
    lines.push('');
  }

  lines.push('<!-- LLM解説エリア: 関数の説明を記述 -->');
  lines.push('');

  if (func.parameters.length > 0) {
    lines.push('**パラメータ**');
    lines.push('');
    lines.push('| 名前 | 型 | 必須 | 説明 |');
    lines.push('|------|-----|------|------|');

    for (const param of func.parameters) {
      const required = !param.optional && !param.defaultValue;
      const description = '<!-- LLM解説 -->';
      lines.push(`| ${param.name} | \`${param.type}\` | ${required ? 'はい' : 'いいえ'} | ${description} |`);
    }
    lines.push('');
  }

  lines.push('**戻り値**');
  lines.push('');
  lines.push(`\`${func.returnType}\``);
  lines.push('<!-- LLM解説エリア: 戻り値の説明 -->');
  lines.push('');

  if (func.isAsync) {
    lines.push('> **注意**: この関数は非同期です。');
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function generateClassSection(cls: ClassInfo): string {
  const lines: string[] = [];

  lines.push(`#### \`${cls.name}\``);
  lines.push('');

  if (cls.jsDoc) {
    lines.push(cls.jsDoc);
    lines.push('');
  }

  lines.push('<!-- LLM解説エリア: クラスの説明を記述 -->');
  lines.push('');

  // 継承・実装
  if (cls.extends) {
    lines.push(`**継承**: \`${cls.extends}\``);
    lines.push('');
  }
  if (cls.implements.length > 0) {
    lines.push(`**実装**: ${cls.implements.map(i => `\`${i}\``).join(', ')}`);
    lines.push('');
  }

  // プロパティ
  if (cls.properties.length > 0) {
    lines.push('**プロパティ**');
    lines.push('');
    lines.push('| 名前 | 型 | 可視性 | 説明 |');
    lines.push('|------|-----|--------|------|');

    for (const prop of cls.properties) {
      const visibility = prop.visibility;
      const description = '<!-- LLM解説 -->';
      const modifiers = [];
      if (prop.isStatic) modifiers.push('static');
      if (prop.isReadonly) modifiers.push('readonly');
      const modStr = modifiers.length > 0 ? ` (${modifiers.join(', ')})` : '';
      lines.push(`| ${prop.name}${modStr} | \`${prop.type}\` | ${visibility} | ${description} |`);
    }
    lines.push('');
  }

  // メソッド
  if (cls.methods.length > 0) {
    lines.push('**メソッド**');
    lines.push('');

    for (const method of cls.methods) {
      const modifiers = [];
      if (method.isStatic) modifiers.push('static');
      if (method.isAsync) modifiers.push('async');
      const modStr = modifiers.length > 0 ? `${modifiers.join(' ')} ` : '';

      lines.push(`- \`${modStr}${method.name}()\``);
      if (method.jsDoc) {
        lines.push(`  ${method.jsDoc}`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function generateInterfaceSection(intf: InterfaceInfo): string {
  const lines: string[] = [];

  lines.push(`#### \`${intf.name}\``);
  lines.push('');

  if (intf.jsDoc) {
    lines.push(intf.jsDoc);
    lines.push('');
  }

  lines.push('<!-- LLM解説エリア: インターフェースの説明を記述 -->');
  lines.push('');

  // 継承
  if (intf.extends.length > 0) {
    lines.push(`**継承**: ${intf.extends.map(i => `\`${i}\``).join(', ')}`);
    lines.push('');
  }

  // プロパティ
  if (intf.properties.length > 0) {
    lines.push('**プロパティ**');
    lines.push('');
    lines.push('| 名前 | 型 | 必須 | 説明 |');
    lines.push('|------|-----|------|------|');

    for (const prop of intf.properties) {
      const required = !prop.optional;
      const description = '<!-- LLM解説 -->';
      const modifiers = [];
      if (prop.isReadonly) modifiers.push('readonly');
      const modStr = modifiers.length > 0 ? ` (${modifiers.join(', ')})` : '';
      lines.push(`| ${prop.name}${modStr} | \`${prop.type}\` | ${required ? 'はい' : 'いいえ'} | ${description} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  return lines.join('\n');
}

function generateDiagramsSection(diagrams: MermaidDiagrams): string {
  const lines: string[] = [];

  if (diagrams.flowchart) {
    lines.push('### 依存関係図');
    lines.push('');
    lines.push('```mermaid');
    lines.push(diagrams.flowchart);
    lines.push('```');
    lines.push('');
  }

  if (diagrams.classDiagram) {
    lines.push('### クラス図');
    lines.push('');
    lines.push('```mermaid');
    lines.push(diagrams.classDiagram);
    lines.push('```');
    lines.push('');
  }

  if (diagrams.sequenceDiagram) {
    lines.push('### シーケンス図');
    lines.push('');
    lines.push('```mermaid');
    lines.push(diagrams.sequenceDiagram);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// LLM Context Generator
// ============================================================================

function generateLLMContext(structure: StructureData): LLMContext {
  // 主要な関数（エクスポート済み、またはJSDocがあるもの）
  const keyFunctions = structure.functions
    .filter(f => f.isExported || f.jsDoc)
    .slice(0, 10)
    .map(f => `${f.name}(${f.parameters.map(p => p.name).join(', ')})`);

  // 主要なクラス
  const keyClasses = structure.classes
    .filter(c => c.isExported || c.jsDoc || c.methods.length > 0)
    .slice(0, 10)
    .map(c => c.name);

  // 主要なインターフェース
  const keyInterfaces = structure.interfaces
    .filter(i => i.isExported || i.jsDoc || i.properties.length > 0)
    .slice(0, 10)
    .map(i => i.name);

  // 依存関係の概要
  const dependencies = [...new Set(
    structure.imports
      .filter(imp => !imp.source.startsWith('.') && !imp.source.startsWith('node:'))
      .map(imp => imp.source)
  )].slice(0, 20);

  // サマリー生成
  const summary = `${structure.files.length}ファイル、${structure.functions.length}関数、${structure.classes.length}クラス、${structure.interfaces.length}インターフェースを検出。`;

  // 推奨解説ポイント
  const suggestedExplanationPoints = generateSuggestedExplanationPoints(structure);

  return {
    summary,
    keyFunctions,
    keyClasses,
    keyInterfaces,
    dependencies,
    suggestedExplanationPoints,
  };
}

function generateSuggestedExplanationPoints(structure: StructureData): string[] {
  const points: string[] = [];

  // エクスポートされている関数が多い場合
  const exportedFunctions = structure.functions.filter(f => f.isExported);
  if (exportedFunctions.length > 5) {
    points.push('公開APIの設計意図と使い分けについて');
  }

  // クラスが継承関係にある場合
  const classesWithExtends = structure.classes.filter(c => c.extends);
  if (classesWithExtends.length > 0) {
    points.push('クラス階層の設計と継承の意図について');
  }

  // 非同期関数が多い場合
  const asyncFunctions = structure.functions.filter(f => f.isAsync);
  if (asyncFunctions.length > 3) {
    points.push('非同期処理のパターンと注意点について');
  }

  // 外部依存がある場合
  const externalDeps = new Set(
    structure.imports
      .filter(imp => !imp.source.startsWith('.'))
      .map(imp => imp.source)
  );
  if (externalDeps.size > 0) {
    points.push('外部ライブラリの選定理由と使用方法について');
  }

  // JSDocがない関数が多い場合
  const functionsWithoutJsDoc = structure.functions.filter(f => !f.jsDoc);
  if (functionsWithoutJsDoc.length > structure.functions.length / 2) {
    points.push('各関数の詳細な動作説明（JSDocが不足しているため）');
  }

  // デフォルトの推奨ポイント
  if (points.length === 0) {
    points.push('このモジュールの主な目的と責任範囲');
    points.push('使用する際の前提条件と注意点');
    points.push('他のモジュールとの関係');
  }

  return points;
}
