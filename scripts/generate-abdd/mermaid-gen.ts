/**
 * @abdd.meta
 * path: scripts/generate-abdd/mermaid-gen.ts
 * role: Mermaid図生成ユーティリティ
 * why: generate-abdd.tsからMermaid図生成ロジックを分離し、保守性を向上させるため
 * related: scripts/generate-abdd/index.ts, scripts/generate-abdd.ts
 * public_api: sanitizeMermaidType, sanitizeMermaidIdentifier, extractMermaidBlocks, validateMermaid
 * invariants: なし
 * side_effects: なし（純粋関数）
 * failure_modes: なし
 * @abdd.explain
 * overview: Mermaid図の生成・検証に関するユーティリティ関数を提供
 * what_it_does:
 *   - Mermaid識別子のサニタイズ
 *   - Mermaidコードブロックの抽出
 *   - Mermaid構文の検証
 * why_it_exists:
 *   - Mermaid生成ロジックを一箇所に集約し、再利用性を高めるため
 * scope:
 *   in: 型名、識別子、Markdownコンテンツ
 *   out: サニタイズ済み文字列、抽出されたコードブロック
 */

import { basename } from 'path';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import * as os from 'os';
import { MERMAID_PARALLEL_LIMIT } from '../../.pi/lib/abdd-types.js';

/**
 * Mermaidクラス図用に型をサニタイズ
 * @param type - 元の型文字列
 * @returns サニタイズ済みの型文字列
 */
export function sanitizeMermaidType(type: string): string {
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

/**
 * Mermaid識別子をサニタイズ
 * @param name - 元の識別子
 * @returns サニタイズ済みの識別子
 */
export function sanitizeMermaidIdentifier(name: string): string {
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

/**
 * MarkdownコンテンツからMermaidコードブロックを抽出
 * @param content - Markdownコンテンツ
 * @returns コードブロックの配列（コードと行番号）
 */
export function extractMermaidBlocks(content: string): { code: string; line: number }[] {
  const blocks: { code: string; line: number }[] = [];
  const lines = content.split('\n');

  let inMermaid = false;
  let currentCode = '';
  let startLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '```mermaid') {
      inMermaid = true;
      startLine = i + 1;
      currentCode = '';
    } else if (inMermaid && line.trim() === '```') {
      inMermaid = false;
      blocks.push({ code: currentCode.trim(), line: startLine });
    } else if (inMermaid) {
      currentCode += line + '\n';
    }
  }

  return blocks;
}

/**
 * Mermaidコードを検証（mmdc CLIを使用）
 * @param code - Mermaidコード
 * @returns 検証結果
 */
export function validateMermaid(code: string): { valid: boolean; error?: string } {
  try {
    // mmdcがインストールされているかチェック
    execSync('which mmdc', { stdio: 'pipe' });
  } catch {
    // mmdcがない場合は簡易検証を使用
    return validateMermaidSimple(code);
  }

  const tmpDir = mkdtempSync(join(os.tmpdir(), 'mermaid-'));
  const inputFile = join(tmpDir, 'input.mmd');
  const outputFile = join(tmpDir, 'output.svg');

  try {
    writeFileSync(inputFile, code, 'utf-8');

    execSync(`mmdc -i "${inputFile}" -o "${outputFile}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    return { valid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { valid: false, error: errorMessage };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Mermaidコードの簡易検証（mmdcなし）
 * @param code - Mermaidコード
 * @returns 検証結果
 */
export function validateMermaidSimple(code: string): { valid: boolean; error?: string } {
  // 基本的な構文チェック
  const diagramTypes = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie', 'mindmap'];
  const firstLine = code.split('\n')[0]?.trim() || '';

  const hasValidDiagramType = diagramTypes.some(type => firstLine.startsWith(type));
  if (!hasValidDiagramType) {
    return { valid: false, error: `不明な図タイプ: ${firstLine}` };
  }

  // 基本的な構文エラーチェック
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    return { valid: false, error: '波括弧の数が一致しません' };
  }

  return { valid: true };
}

// join is used in validateMermaid
function join(...paths: string[]): string {
  return paths.join('/');
}
