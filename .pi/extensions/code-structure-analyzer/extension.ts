/**
 * @abdd.meta
 * path: .pi/extensions/code-structure-analyzer/extension.ts
 * role: コード構造解析拡張機能のエントリーポイントおよびオーケストレーター
 * why: 実装からAST、Mermaid図、ドキュメントを統合的に生成し、開発とドキュメント作成のギャップを埋めるため
 * related: ./tools/extract-structure.js, ./tools/generate-diagrams.js, ./tools/generate-doc.js, @mariozechner/pi-coding-agent
 * public_api: AnalyzeOptions, AnalysisResult, analyzeCodeStructure
 * invariants: 出力ディレクトリが未指定の場合はデフォルト動作へ委譲, LLMコンテキストフラグが未指定の場合はtrueを適用
 * side_effects: ファイルシステムへの読み取りおよび書き込み（出力ディレクトリ作成を含む）
 * failure_modes: 対象パスが存在しない場合、AST解析エラー、ディレクトリ作成権限不足
 * @abdd.explain
 * overview: AST抽出、Mermaid図生成、ドキュメントセクション生成の3フェーズで構成されるコード解析パイプラインを定義する
 * what_it_does:
 *   - AnalyzeOptionsに基づいて対象コードの構造データ（StructureData）を抽出する
 *   - 構造データから指定された種類のMermaid図（Flowchart, Class, Sequence）を生成する
 *   - 構造データとテンプレートを元にドキュメントセクションを生成する
 * why_it_exists:
 *   - コードの静的解析結果を可視化およびドキュメント化するプロセスを自動化する
 *   - 機械的生成とLLMによる解説を組み合わせたハイブリッドなドキュメント生成システムを実現する
 * scope:
 *   in: AnalyzeOptions（対象パス、図種別、テンプレートパス、除外パターン）
 *   out: AnalysisResult（構造データ、Mermaid図、ドキュメントセクション、メタデータ）
 */

/**
 * Code Structure Analyzer Extension
 *
 * 実装からドキュメントを自動生成するハイブリッドシステム
 * - 機械的生成: AST抽出、Mermaid図、関数シグネチャ
 * - LLM解説: 既存チーム（Mermaid Diagram Team、Docs Enablement Team）による品質保証
 */

import { extractCodeStructure, type ExtractOptions, type StructureData } from './tools/extract-structure.js';
import { generateMermaidDiagrams, type DiagramOptions, type MermaidDiagrams } from './tools/generate-diagrams.js';
import { generateDocSections, type DocOptions, type DocSections } from './tools/generate-doc.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, relative, basename } from 'path';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

// ============================================================================
// Types
// ============================================================================

/**
 * 解析オプション定義
 * @summary 解析オプション設定
 * @param target 解析対象のパス
 * @param outputDir 出力先ディレクトリ
 * @param diagramTypes 生成する図の種類
 * @param templatePath テンプレートファイルパス
 * @param exclude 除外対象パターン
 */
export interface AnalyzeOptions {
  /** 対象ソースファイルまたはディレクトリ */
  target: string;
  /** 出力ディレクトリ */
  outputDir?: string;
  /** 生成する図の種類 */
  diagramTypes?: ('flowchart' | 'classDiagram' | 'sequenceDiagram')[];
  /** テンプレートファイルパス */
  templatePath?: string;
  /** 除外パターン */
  exclude?: string[];
  /** LLM用コンテキストを含める */
  includeLLMContext?: boolean;
}

/**
 * 解析結果インターフェース
 * @summary 解析結果定義
 * @property structure 構造データ
 * @property diagrams ダイアグラム
 * @property docSections ドキュメントセクション
 * @property metadata メタデータ
 */
export interface AnalysisResult {
  /** 構造化データ */
  structure: StructureData;
  /** Mermaid図 */
  diagrams: MermaidDiagrams;
  /** ドキュメントセクション */
  docSections: DocSections;
  /** メタデータ */
  metadata: {
    analyzedAt: string;
    sourcePath: string;
    fileHash: string;
    stats: {
      functions: number;
      classes: number;
      interfaces: number;
      imports: number;
    };
  };
}

// ============================================================================
// Main Tool Functions
// ============================================================================

/**
 * コード構造を解析
 * @summary コード構造解析
 * @param params 解析オプション
 * @param params.target 対象ディレクトリ
 * @param params.outputDir 出力先ディレクトリ
 * @param params.diagramTypes ダイアグラム種別
 * @param params.includeLLMContext LLMコンテキストフラグ
 * @returns 解析結果データ
 */
export async function analyzeCodeStructure(params: {
  target: string;
  outputDir?: string;
  diagramTypes?: string[];
  includeLLMContext?: boolean;
}): Promise<AnalysisResult> {
  const options: AnalyzeOptions = {
    target: params.target,
    outputDir: params.outputDir,
    diagramTypes: (params.diagramTypes as AnalyzeOptions['diagramTypes']) || ['flowchart', 'classDiagram', 'sequenceDiagram'],
    includeLLMContext: params.includeLLMContext ?? true,
  };

  // Phase 1: AST抽出
  const extractOptions: ExtractOptions = {
    targetPath: options.target,
    excludePatterns: options.exclude || [],
  };

  const structure = await extractCodeStructure(extractOptions);

  // Phase 2: Mermaid図生成
  const diagramOptions: DiagramOptions = {
    types: options.diagramTypes || ['flowchart', 'classDiagram', 'sequenceDiagram'],
    includePositions: true,
  };

  const diagrams = generateMermaidDiagrams(structure, diagramOptions);

  // Phase 3: ドキュメントセクション生成
  const docOptions: DocOptions = {
    templatePath: options.templatePath,
    includeLLMContext: options.includeLLMContext ?? true,
  };

  const docSections = generateDocSections(structure, diagrams, docOptions);

  // メタデータ生成
  const metadata = {
    analyzedAt: new Date().toISOString(),
    sourcePath: options.target,
    fileHash: computeHash(structure),
    stats: {
      functions: structure.functions.length,
      classes: structure.classes.length,
      interfaces: structure.interfaces.length,
      imports: structure.imports.length,
    },
  };

  return {
    structure,
    diagrams,
    docSections,
    metadata,
  };
}

/**
 * 構造を抽出
 * @summary 構造抽出
 * @param params ターゲットと除外設定
 * @param params.target 対象ディレクトリ
 * @param params.exclude 除外パターン
 * @returns 抽出された構造データ
 */
export async function extractStructure(params: {
  target: string;
  exclude?: string[];
}): Promise<StructureData> {
  const options: ExtractOptions = {
    targetPath: params.target,
    excludePatterns: params.exclude || [],
  };

  return extractCodeStructure(options);
}

/**
 * ダイアグラム生成
 * @summary ダイアグラム生成
 * @param params 構造データと種別
 * @param params.structure 構造データ
 * @param params.types ダイアグラム種別
 * @returns Mermaidダイアグラムデータ
 */
export async function generateDiagrams(params: {
  structure: StructureData;
  types?: string[];
}): Promise<MermaidDiagrams> {
  const options: DiagramOptions = {
    types: (params.types as DiagramOptions['types']) || ['flowchart', 'classDiagram', 'sequenceDiagram'],
    includePositions: true,
  };

  return generateMermaidDiagrams(params.structure, options);
}

/**
 * Markdownを生成
 * @summary Markdown生成
 * @param params 解析結果と出力パス
 * @param params.result 解析結果データ
 * @param params.outputPath 出力先ファイルパス
 * @returns 生成されたMarkdown文字列
 */
export async function generateMarkdown(params: {
  result: AnalysisResult;
  outputPath?: string;
}): Promise<string> {
  const { result, outputPath } = params;

  // Markdown生成
  let markdown = '';

  // フロントマター
  markdown += `---\n`;
  markdown += `title: ${result.docSections.title}\n`;
  markdown += `category: reference\n`;
  markdown += `audience: developer\n`;
  markdown += `last_updated: ${result.metadata.analyzedAt.split('T')[0]}\n`;
  markdown += `tags: [api-reference, auto-generated]\n`;
  markdown += `related: []\n`;
  markdown += `---\n\n`;

  // 概要セクション（LLM用コンテキスト）
  if (result.docSections.overview) {
    markdown += `## 概要\n\n`;
    markdown += `<!-- LLM解説エリア: 以下に実装の概要を記述 -->\n`;
    markdown += `${result.docSections.overview}\n\n`;
  }

  // 構造セクション
  if (result.docSections.structure) {
    markdown += `## 構造\n\n`;
    markdown += result.docSections.structure;
    markdown += '\n\n';
  }

  // APIリファレンスセクション
  if (result.docSections.apiReference) {
    markdown += `## APIリファレンス\n\n`;
    markdown += result.docSections.apiReference;
    markdown += '\n\n';
  }

  // 図解セクション
  markdown += `## 図解\n\n`;

  if (result.diagrams.flowchart) {
    markdown += `### 依存関係図\n\n`;
    markdown += '```mermaid\n';
    markdown += result.diagrams.flowchart;
    markdown += '\n```\n\n';
  }

  if (result.diagrams.classDiagram) {
    markdown += `### クラス図\n\n`;
    markdown += '```mermaid\n';
    markdown += result.diagrams.classDiagram;
    markdown += '\n```\n\n';
  }

  if (result.diagrams.sequenceDiagram) {
    markdown += `### シーケンス図\n\n`;
    markdown += '```mermaid\n';
    markdown += result.diagrams.sequenceDiagram;
    markdown += '\n```\n\n';
  }

  // LLM解説エリア
  markdown += `## 詳細解説\n\n`;
  markdown += `<!-- LLM解説エリア: 以下に実装の詳細な解説を記述 -->\n`;
  markdown += `<!-- 設計判断、使用例、注意点などを追加してください -->\n\n`;
  markdown += `_（このセクションはLLMまたは人間が記述します）_\n\n`;

  // メタデータセクション
  markdown += `## メタデータ\n\n`;
  markdown += `| 項目 | 値 |\n`;
  markdown += `|------|-----|\n`;
  markdown += `| 解析日時 | ${result.metadata.analyzedAt} |\n`;
  markdown += `| ソースパス | ${result.metadata.sourcePath} |\n`;
  markdown += `| ファイルハッシュ | ${result.metadata.fileHash.substring(0, 12)}... |\n`;
  markdown += `| 関数数 | ${result.metadata.stats.functions} |\n`;
  markdown += `| クラス数 | ${result.metadata.stats.classes} |\n`;
  markdown += `| インターフェース数 | ${result.metadata.stats.interfaces} |\n`;

  // ファイルに出力
  if (outputPath) {
    const dir = join(outputPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, markdown, 'utf-8');
  }

  return markdown;
}

/**
 * 構造データのハッシュを計算（ドリフト検出用）
 */
function computeHash(structure: StructureData): string {
  const crypto = require('crypto');
  const content = JSON.stringify({
    functions: structure.functions.map(f => ({ name: f.name, signature: f.signature })),
    classes: structure.classes.map(c => ({ name: c.name, methods: c.methods.map(m => m.name) })),
    interfaces: structure.interfaces.map(i => ({ name: i.name, properties: i.properties.map(p => p.name) })),
    imports: structure.imports.map(i => i.source),
  });
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ============================================================================
// Extension Definition
// ============================================================================

import { Type } from "@mariozechner/pi-ai";

/**
 * @summary 拡張機能登録関数
 * @param pi Pi拡張API
 */
export default function registerCodeStructureAnalyzerExtension(pi: ExtensionAPI) {
  // ツールを登録
  pi.registerTool({
    name: "analyze_code_structure",
    label: "Analyze Code Structure",
    description: "TypeScriptソースコードを解析し、構造データ、Mermaid図、ドキュメントセクションを生成する。ハイブリッドドキュメント生成のメインツール。",
    parameters: Type.Object({
      target: Type.String({ description: "解析対象のファイルまたはディレクトリパス" }),
      outputDir: Type.Optional(Type.String({ description: "出力ディレクトリ（省略時は結果のみ返却）" })),
      diagramTypes: Type.Optional(Type.Array(Type.Union([
        Type.Literal("flowchart"),
        Type.Literal("classDiagram"),
        Type.Literal("sequenceDiagram"),
      ]), { description: "生成する図の種類（デフォルト: 全て）" })),
      includeLLMContext: Type.Optional(Type.Boolean({ description: "LLM用コンテキストを含めるか（デフォルト: true）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await analyzeCodeStructure({
        target: params.target,
        outputDir: params.outputDir,
        diagramTypes: params.diagramTypes,
        includeLLMContext: params.includeLLMContext,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "extract_structure",
    label: "Extract Structure",
    description: "TypeScriptソースコードから構造データのみを抽出（軽量版）。AST解析結果をJSONで取得。",
    parameters: Type.Object({
      target: Type.String({ description: "解析対象のファイルまたはディレクトリパス" }),
      exclude: Type.Optional(Type.Array(Type.String(), { description: "除外パターン（glob形式）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await extractStructure({
        target: params.target,
        exclude: params.exclude,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "generate_diagrams",
    label: "Generate Diagrams",
    description: "構造データからMermaid図を生成。flowchart（依存関係）、classDiagram（クラス構造）、sequenceDiagram（呼び出しフロー）に対応。",
    parameters: Type.Object({
      structure: Type.Any({ description: "extract_structureで取得した構造データ" }),
      types: Type.Optional(Type.Array(Type.Union([
        Type.Literal("flowchart"),
        Type.Literal("classDiagram"),
        Type.Literal("sequenceDiagram"),
      ]), { description: "生成する図の種類" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const result = await generateDiagrams({
        structure: params.structure,
        types: params.types,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "generate_markdown_doc",
    label: "Generate Markdown Doc",
    description: "解析結果からMarkdown形式のドキュメントを生成。LLM解説用のプレースホルダを含むハイブリッド形式。",
    parameters: Type.Object({
      result: Type.Any({ description: "analyze_code_structureの結果" }),
      outputPath: Type.Optional(Type.String({ description: "出力ファイルパス（省略時は結果のみ返却）" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const markdown = await generateMarkdown({
        result: params.result,
        outputPath: params.outputPath,
      });
      return {
        content: [{ type: "text" as const, text: markdown }],
        details: { outputPath: params.outputPath },
      };
    },
  });
}
