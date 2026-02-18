/**
 * Mermaid Diagram Generator
 *
 * 構造データからMermaid図を生成
 * - flowchart: 依存関係図
 * - classDiagram: クラス構造図
 * - sequenceDiagram: 呼び出しフロー図
 */

import type { StructureData, ClassInfo, FunctionInfo, ImportInfo } from './extract-structure.js';

// ============================================================================
// Types
// ============================================================================

/**
 * /**
 * * 図生成の設定オプション
 * *
 * * Mermaid図を生成する際の設定を定義します。
 * * 生成する図
 */
 /**
  * 図生成の設定オプション
  * @param types 生成する図の種類
  * @param includePositions ノードの位置情報を含めるかどうか
  */
export interface DiagramOptions {
  /** 生成する図の種類 */
  types: ('flowchart' | 'classDiagram' | 'sequenceDiagram')[];
  /** ノードの位置情報を含める */
  includePositions?: boolean;
}

 /**
  * Mermaid図の出力結果
  * @property flowchart 依存関係図
  * @property classDiagram クラス図
  * @property sequenceDiagram シーケンス図
  */
export interface MermaidDiagrams {
  /** 依存関係図（flowchart） */
  flowchart?: string;
  /** クラス図（classDiagram） */
  classDiagram?: string;
  /** シーケンス図（sequenceDiagram） */
  sequenceDiagram?: string;
}

// ============================================================================
// Main Export Function
// ============================================================================

 /**
  * 構造データからMermaid図を生成する
  * @param structure 解析対象の構造データ
  * @param options 図の生成オプション
  * @returns 生成されたMermaid図のオブジェクト
  */
export function generateMermaidDiagrams(
  structure: StructureData,
  options: DiagramOptions
): MermaidDiagrams {
  const result: MermaidDiagrams = {};

  for (const type of options.types) {
    switch (type) {
      case 'flowchart':
        result.flowchart = generateFlowchart(structure);
        break;
      case 'classDiagram':
        result.classDiagram = generateClassDiagram(structure);
        break;
      case 'sequenceDiagram':
        result.sequenceDiagram = generateSequenceDiagram(structure);
        break;
    }
  }

  return result;
}

// ============================================================================
// Flowchart Generator (依存関係図)
// ============================================================================

function generateFlowchart(structure: StructureData): string {
  const lines: string[] = ['flowchart TD'];

  // サブグラフでファイルをグループ化
  const dirGroups = new Map<string, string[]>();

  for (const file of structure.files) {
    const dir = file.relativePath.split('/').slice(0, -1).join('/') || 'root';
    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, []);
    }
    dirGroups.get(dir)!.push(file.relativePath);
  }

  // ディレクトリごとのサブグラフ
  let subgraphIndex = 0;
  const nodeIdMap = new Map<string, string>();

  for (const [dir, files] of Array.from(dirGroups.entries())) {
    const subgraphName = `sg${subgraphIndex++}`;
    const dirLabel = sanitizeLabel(dir);

    lines.push(`  subgraph ${subgraphName}[${dirLabel}]`);

    for (const file of files) {
      const nodeId = `node${nodeIdMap.size}`;
      nodeIdMap.set(file, nodeId);

      const fileName = file.split('/').pop() || file;
      const label = sanitizeLabel(fileName.replace(/\.(ts|tsx)$/, ''));
      lines.push(`    ${nodeId}[${label}]`);
    }

    lines.push('  end');
  }

  // 依存関係のエッジ
  const addedEdges = new Set<string>();

  for (const edge of structure.dependencyGraph.edges) {
    const fromNode = nodeIdMap.get(edge.from);
    const toNode = nodeIdMap.get(edge.to);

    if (fromNode && toNode) {
      const edgeKey = `${fromNode}->${toNode}`;
      if (!addedEdges.has(edgeKey)) {
        lines.push(`  ${fromNode} --> ${toNode}`);
        addedEdges.add(edgeKey);
      }
    }
  }

  // 外部ライブラリへの依存も追加
  const externalDeps = new Set<string>();
  for (const imp of structure.imports) {
    if (!imp.source.startsWith('.') && !imp.source.startsWith('node:')) {
      externalDeps.add(imp.source);
    }
  }

  if (externalDeps.size > 0) {
    lines.push('  subgraph external[外部ライブラリ]');
    let extIndex = 0;
    for (const dep of Array.from(externalDeps)) {
      const label = sanitizeLabel(dep);
      lines.push(`    ext${extIndex++}[${label}]`);
    }
    lines.push('  end');
  }

  return lines.join('\n');
}

// ============================================================================
// Class Diagram Generator (クラス構造図)
// ============================================================================

function generateClassDiagram(structure: StructureData): string {
  const lines: string[] = ['classDiagram'];

  // クラス定義
  for (const cls of structure.classes) {
    const className = sanitizeIdentifier(cls.name);

    // クラス本体
    lines.push(`  class ${className} {`);

    // JSDocコメント
    if (cls.jsDoc) {
      lines.push(`    %% ${truncateText(cls.jsDoc, 80)}`);
    }

    // プロパティ
    for (const prop of cls.properties) {
      const visibility = getVisibilitySymbol(prop.visibility);
      const readonly = prop.isReadonly ? 'readonly ' : '';
      const staticMod = prop.isStatic ? '$' : '';
      const type = sanitizeType(prop.type);
      lines.push(`    ${visibility}${staticMod}${readonly}${prop.name}: ${type}`);
    }

    // メソッド
    for (const method of cls.methods) {
      const visibility = getVisibilitySymbol(method.visibility);
      const staticMod = method.isStatic ? '$' : '';
      const params = method.parameters.map(p => `${p.name}: ${sanitizeType(p.type)}`).join(', ');
      const returnType = sanitizeType(method.returnType);
      const asyncPrefix = method.isAsync ? 'async ' : '';
      lines.push(`    ${visibility}${staticMod}${asyncPrefix}${method.name}(${params}) ${returnType}`);
    }

    lines.push('  }');

    // 継承関係
    if (cls.extends) {
      const parentName = sanitizeIdentifier(cls.extends);
      lines.push(`  ${parentName} <|-- ${className}`);
    }

    // インターフェース実装
    for (const impl of cls.implements) {
      const interfaceName = sanitizeIdentifier(impl);
      lines.push(`  ${interfaceName} <|.. ${className}`);
    }
  }

  // インターフェース定義
  for (const intf of structure.interfaces) {
    const interfaceName = sanitizeIdentifier(intf.name);

    lines.push(`  class ${interfaceName} {`);
    lines.push(`    %% interface`);

    // プロパティ
    for (const prop of intf.properties) {
      const optional = prop.optional ? '?' : '';
      const readonly = prop.isReadonly ? 'readonly ' : '';
      const type = sanitizeType(prop.type);
      lines.push(`    ${readonly}${prop.name}${optional}: ${type}`);
    }

    // メソッド
    for (const method of intf.methods) {
      const params = method.parameters.map(p => `${p.name}: ${sanitizeType(p.type)}`).join(', ');
      const returnType = sanitizeType(method.returnType);
      lines.push(`    ${method.name}(${params}) ${returnType}`);
    }

    lines.push('  }');

    // インターフェース継承
    for (const ext of intf.extends) {
      const parentName = sanitizeIdentifier(ext);
      lines.push(`  ${parentName} <|-- ${interfaceName}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Sequence Diagram Generator (呼び出しフロー図)
// ============================================================================

function generateSequenceDiagram(structure: StructureData): string {
  const lines: string[] = ['sequenceDiagram'];
  lines.push('  autonumber');

  // 参加者を定義
  const participants = new Map<string, string>();
  let participantIndex = 0;

  // ファイルを参加者として登録
  for (const file of structure.files) {
    const name = file.relativePath.split('/').pop()?.replace(/\.(ts|tsx)$/, '') || `P${participantIndex}`;
    const participantId = `P${participantIndex++}`;
    participants.set(file.relativePath, participantId);
    lines.push(`  participant ${participantId} as ${sanitizeLabel(name)}`);
  }

  // エクスポートされた関数呼び出しを表現
  // （実際の呼び出し関係は静的解析では困難なため、エクスポート/インポート関係から推論）

  const importedFunctions = new Map<string, string[]>();

  // インポート情報を整理
  for (const file of structure.files) {
    for (const imp of file.imports) {
      if (imp.source.startsWith('.')) {
        const key = `${file.relativePath}:${imp.source}`;
        importedFunctions.set(key, imp.names);
      }
    }
  }

  // メインフロー（簡易的な推論）
  lines.push('');
  lines.push('  %% 呼び出しフロー（インポート関係から推論）');

  for (const file of structure.files) {
    const callerId = participants.get(file.relativePath);
    if (!callerId) continue;

    for (const imp of file.imports) {
      if (imp.source.startsWith('.')) {
        // インポート先のファイルを探す
        const importPath = resolveImportPath(file.relativePath, imp.source);
        const calleeId = participants.get(importPath);

        if (calleeId && calleeId !== callerId) {
          for (const name of imp.names) {
            lines.push(`  ${callerId}->>${calleeId}: ${name}`);
          }
        }
      }
    }
  }

  // エクスポートされた関数の戻り
  lines.push('');
  lines.push('  %% エクスポート');

  for (const file of structure.files) {
    const callerId = participants.get(file.relativePath);
    if (!callerId) continue;

    const exportedFunctions = file.functions.filter(f => f.isExported);
    for (const func of exportedFunctions) {
      lines.push(`  Note over ${callerId}: exports ${func.name}()`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

function sanitizeLabel(text: string): string {
  // Mermaidラベルで特殊文字をエスケープ
  return text
    .replace(/"/g, "'")
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizeIdentifier(name: string): string {
  // Mermaid識別子で使用可能な形式に変換
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1');
}

function sanitizeType(type: string): string {
  // 型情報をMermaidで表示可能な形式に短縮
  return type
    .replace(/import\("[^"]+"\)\./g, '')
    .replace(/\s+/g, ' ')
    .substring(0, 50);
}

function getVisibilitySymbol(visibility: 'public' | 'protected' | 'private'): string {
  switch (visibility) {
    case 'private': return '-';
    case 'protected': return '#';
    case 'public': return '+';
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function resolveImportPath(fromPath: string, importSource: string): string {
  const fromDir = fromPath.split('/').slice(0, -1).join('/');
  const resolved = join(fromDir, importSource);
  return resolved.replace(/^\.\//, '').replace(/\/\.\//g, '/');
}

function join(...paths: string[]): string {
  return paths
    .map((p, i) => {
      if (i === 0) return p.replace(/\/+$/, '');
      return p.replace(/^\/+|\/+$/g, '');
    })
    .filter(Boolean)
    .join('/');
}
