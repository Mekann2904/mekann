/**
 * @abdd.meta
 * path: scripts/generate-abdd/file-utils.ts
 * role: ファイル操作ユーティリティ
 * why: generate-abdd.tsからファイル操作関数を分離し、保守性を向上させるため
 * related: scripts/generate-abdd/index.ts, scripts/generate-abdd.ts
 * public_api: collectTypeScriptFiles, collectMarkdownFiles, mkdirIfNotExists
 * invariants: なし
 * side_effects: ファイルシステムの読み取り・ディレクトリ作成
 * failure_modes: ディレクトリ不在、権限エラー
 * @abdd.explain
 * overview: ファイルシステム操作に関するユーティリティ関数を提供
 * what_it_does:
 *   - TypeScriptファイルの収集（.ts, .tsx、.d.ts除外）
 *   - Markdownファイルの収集
 *   - ディレクトリの再帰的作成
 * why_it_exists:
 *   - ファイル操作ロジックを一箇所に集約し、再利用性を高めるため
 * scope:
 *   in: ディレクトリパス
 *   out: ファイルパスのリスト
 */

import { readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * 指定ディレクトリ配下のTypeScriptファイルを収集
 * @param dir - 検索開始ディレクトリ
 * @returns TypeScriptファイルの絶対パス配列
 */
export function collectTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string) {
    const entries = readdirSync(currentPath);
    for (const entry of entries) {
      const fullPath = join(currentPath, entry);
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

/**
 * 指定ディレクトリ配下のMarkdownファイルを収集
 * @param dir - 検索開始ディレクトリ
 * @returns Markdownファイルの絶対パス配列
 */
export function collectMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string) {
    const entries = readdirSync(currentPath);
    for (const entry of entries) {
      const fullPath = join(currentPath, entry);
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

/**
 * ディレクトリが存在しない場合は作成
 * @param dir - 作成するディレクトリパス
 */
export function mkdirIfNotExists(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
