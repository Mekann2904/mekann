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

// ============================================================================
// Types
// ============================================================================

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
 * コード構造を解析し、ドキュメント生成に必要なデータを抽出
 *
 * @param params 解析オプション
 * @returns 解析結果（構造データ、Mermaid図、ドキュメントセクション）
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
 * 構造データのみを抽出（軽量版）
 *
 * @param params 抽出オプション
 * @returns 構造化データ
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
 * Mermaid図のみを生成（構造データから）
 *
 * @param params 生成オプション
 * @returns Mermaid図
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
 * ドキュメントをMarkdown形式で出力
 *
 * @param params 出力オプション
 * @returns Markdownテキスト
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
// Tool Definitions for Pi
// ============================================================================

export const tools = [
  {
    name: 'analyze_code_structure',
    description: 'TypeScriptソースコードを解析し、構造データ、Mermaid図、ドキュメントセクションを生成する。ハイブリッドドキュメント生成のメインツール。',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: '解析対象のファイルまたはディレクトリパス',
        },
        outputDir: {
          type: 'string',
          description: '出力ディレクトリ（省略時は結果のみ返却）',
        },
        diagramTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['flowchart', 'classDiagram', 'sequenceDiagram'],
          },
          description: '生成する図の種類（デフォルト: 全て）',
        },
        includeLLMContext: {
          type: 'boolean',
          description: 'LLM用コンテキストを含めるか（デフォルト: true）',
        },
      },
      required: ['target'],
    },
    execute: analyzeCodeStructure,
  },
  {
    name: 'extract_structure',
    description: 'TypeScriptソースコードから構造データのみを抽出（軽量版）。AST解析結果をJSONで取得。',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: '解析対象のファイルまたはディレクトリパス',
        },
        exclude: {
          type: 'array',
          items: { type: 'string' },
          description: '除外パターン（glob形式）',
        },
      },
      required: ['target'],
    },
    execute: extractStructure,
  },
  {
    name: 'generate_diagrams',
    description: '構造データからMermaid図を生成。flowchart（依存関係）、classDiagram（クラス構造）、sequenceDiagram（呼び出しフロー）に対応。',
    parameters: {
      type: 'object',
      properties: {
        structure: {
          type: 'object',
          description: 'extract_structureで取得した構造データ',
        },
        types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['flowchart', 'classDiagram', 'sequenceDiagram'],
          },
          description: '生成する図の種類',
        },
      },
      required: ['structure'],
    },
    execute: generateDiagrams,
  },
  {
    name: 'generate_markdown_doc',
    description: '解析結果からMarkdown形式のドキュメントを生成。LLM解説用のプレースホルダを含むハイブリッド形式。',
    parameters: {
      type: 'object',
      properties: {
        result: {
          type: 'object',
          description: 'analyze_code_structureの結果',
        },
        outputPath: {
          type: 'string',
          description: '出力ファイルパス（省略時は結果のみ返却）',
        },
      },
      required: ['result'],
    },
    execute: generateMarkdown,
  },
];

// ============================================================================
// Extension Definition
// ============================================================================

export default {
  name: 'code-structure-analyzer',
  version: '1.0.0',
  description: '実装からドキュメントを自動生成するハイブリッドシステム。機械的生成（AST、Mermaid図）とLLM解説を融合。',
  tools,
};
