#!/usr/bin/env npx tsx
/**
 * Frontmatter自動追加スクリプト
 *
 * Markdownファイルに必要なYAML frontmatterを追加または更新する。
 *
 * 使用方法:
 *   npx tsx scripts/add-frontmatter.ts [options] [files...]
 *
 * オプション:
 *   --dry-run       変更を適用せず、変更内容のみ表示
 *   --verbose       詳細ログを出力
 *   --date DATE     last_updated日付を指定（デフォルト: 今日）
 *   --skip-existing 既存のfrontmatterを上書きしない
 *
 * テンプレート（.pi/APPEND_SYSTEM.md の Document Template）:
 *   必須フィールド: title, category, audience, last_updated, tags, related
 *   category: getting-started | user-guide | development | reference | meta
 *   audience: new-user | daily-user | developer | contributor
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// 定数定義
// ============================================================================

/** 許可されるcategory値 */
const VALID_CATEGORIES = ['getting-started', 'user-guide', 'development', 'reference', 'meta'];

/** 許可されるaudience値 */
const VALID_AUDIENCES = ['new-user', 'daily-user', 'developer', 'contributor'];

/** テンプレートから除外するファイルパターン */
const EXCLUDE_PATTERNS = [
  /_template\.md$/,
  /.*-template\.md$/,
  /\.SUMMARY\.md$/,
  /\/runs\//,
  /\/references\//,
  /AGENTS\.md$/,
  /APPEND_SYSTEM\.md$/,
  /INDEX\.md$/,
  /NAVIGATION\.md$/,
  /SYSTEM\.md$/,
];

// ============================================================================
// Types
// ============================================================================

interface Frontmatter {
  title?: string;
  category?: string;
  audience?: string | string[];
  last_updated?: string;
  tags?: string[];
  related?: string[];
}

interface FileResult {
  filePath: string;
  status: 'skipped' | 'no-changes' | 'updated' | 'added';
  oldFrontmatter?: Frontmatter;
  newFrontmatter?: Frontmatter;
  reason?: string;
}

// ============================================================================
// ユーティリティ関数
// ============================================================================

/**
 * パスが除外パターンに一致するかチェック
 */
function shouldExclude(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Markdownコンテンツからfrontmatterと本文を抽出
 */
function parseFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) {
    return { frontmatter: '', body: content };
  }
  return { frontmatter: match[1], body: match[2] ?? '' };
}

/**
 * YAML文字列をfrontmatterオブジェクトに変換（簡易実装）
 */
function parseYamlFrontmatter(yaml: string): Frontmatter {
  const frontmatter: Frontmatter = {};
  
  // title: "値"
  const titleMatch = yaml.match(/^title:\s*(.+)$/m);
  if (titleMatch) frontmatter.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
  
  // category: 値
  const categoryMatch = yaml.match(/^category:\s*(.+)$/m);
  if (categoryMatch) frontmatter.category = categoryMatch[1].trim();
  
  // audience: 値 または audience: [a, b]
  const audienceMatch = yaml.match(/^audience:\s*(.+)$/m);
  if (audienceMatch) {
    const value = audienceMatch[1].trim();
    if (value.startsWith('[')) {
      frontmatter.audience = value.slice(1, -1).split(',').map(s => s.trim());
    } else {
      frontmatter.audience = value;
    }
  }
  
  // last_updated: YYYY-MM-DD
  const dateMatch = yaml.match(/^last_updated:\s*(\d{4}-\d{2}-\d{2})$/m);
  if (dateMatch) frontmatter.last_updated = dateMatch[1];
  
  // tags: [a, b, c]
  const tagsMatch = yaml.match(/^tags:\s*\[(.+)\]$/m);
  if (tagsMatch) {
    frontmatter.tags = tagsMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  }
  
  // related: [./file.md, ./other.md]
  const relatedMatch = yaml.match(/^related:\s*\[(.+)\]$/m);
  if (relatedMatch) {
    frontmatter.related = relatedMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
  }
  
  return frontmatter;
}

/**
 * frontmatterオブジェクトをYAML文字列に変換
 */
function stringifyFrontmatter(fm: Frontmatter): string {
  const lines: string[] = [];
  
  if (fm.title !== undefined) lines.push(`title: ${fm.title}`);
  if (fm.category !== undefined) lines.push(`category: ${fm.category}`);
  if (fm.audience !== undefined) {
    if (Array.isArray(fm.audience)) {
      lines.push(`audience: [${fm.audience.join(', ')}]`);
    } else {
      lines.push(`audience: ${fm.audience}`);
    }
  }
  if (fm.last_updated !== undefined) lines.push(`last_updated: ${fm.last_updated}`);
  if (fm.tags !== undefined) {
    const tagsStr = fm.tags.map(t => typeof t === 'string' ? t : String(t)).join(', ');
    lines.push(`tags: [${tagsStr}]`);
  }
  if (fm.related !== undefined) {
    const relatedStr = fm.related.map(r => typeof r === 'string' ? r : String(r)).join(', ');
    lines.push(`related: [${relatedStr}]`);
  }
  
  return lines.join('\n');
}

/**
 * MarkdownコンテンツからH1見出しを抽出してタイトルとして使用
 */
function extractTitleFromContent(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * ファイルパスからcategoryを推測
 */
function inferCategory(filePath: string): string {
  const segments = filePath.split('/');
  const docsIndex = segments.indexOf('docs');
  
  if (docsIndex === -1 || docsIndex + 1 >= segments.length) {
    return 'meta';
  }
  
  const nextSegment = segments[docsIndex + 1];
  if (nextSegment.startsWith('01-') || nextSegment === 'getting-started') return 'getting-started';
  if (nextSegment.startsWith('02-') || nextSegment === 'user-guide') return 'user-guide';
  if (nextSegment.startsWith('03-') || nextSegment === 'development') return 'development';
  if (nextSegment.startsWith('04-') || nextSegment === 'reference') return 'reference';
  
  return 'meta';
}

/**
 * ファイルパスからaudienceを推測
 */
function inferAudience(filePath: string): string {
  const category = inferCategory(filePath);
  
  if (category === 'getting-started') return 'new-user';
  if (category === 'user-guide') return 'daily-user';
  if (category === 'development') return 'developer';
  
  return 'developer';
}

/**
 * frontmatterをマージ（既存値を優先）
 */
function mergeFrontmatter(existing: Frontmatter, defaults: Frontmatter): Frontmatter {
  const merged: Frontmatter = { ...defaults };
  
  // 既存値を優先
  for (const key of Object.keys(existing) as Array<keyof Frontmatter>) {
    const value = existing[key];
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }
  
  return merged;
}

/**
 * Markdownファイルのfrontmatterを処理
 */
function processFile(
  filePath: string,
  options: {
    dryRun: boolean;
    date: string;
    skipExisting: boolean;
    verbose: boolean;
  }
): FileResult {
  const result: FileResult = { filePath, status: 'skipped' };
  
  // 除外パターンチェック
  if (shouldExclude(filePath)) {
    result.status = 'skipped';
    result.reason = 'matches exclude pattern';
    return result;
  }
  
  // コンテンツ読み込み
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (e) {
    result.status = 'skipped';
    result.reason = 'cannot read file';
    return result;
  }
  
  // 空ファイルチェック
  if (!content.trim()) {
    result.status = 'skipped';
    result.reason = 'empty file';
    return result;
  }
  
  // frontmatter解析
  const { frontmatter: fmText, body } = parseFrontmatter(content);
  const existingFm = parseYamlFrontmatter(fmText);
  result.oldFrontmatter = { ...existingFm };
  
  // 既存のfrontmatterがある場合
  const hasFrontmatter = fmText.length > 0;
  
  if (hasFrontmatter && options.skipExisting) {
    result.status = 'no-changes';
    result.reason = 'existing frontmatter preserved (--skip-existing)';
    return result;
  }
  
  // デフォルト値生成
  const title = existingFm.title || extractTitleFromContent(hasFrontmatter ? body : content) || 'Untitled';
  const category = existingFm.category || inferCategory(filePath);
  const audience = existingFm.audience || inferAudience(filePath);
  const last_updated = existingFm.last_updated || options.date;
  const tags = existingFm.tags || [];
  const related = existingFm.related || [];
  
  const newFm: Frontmatter = {
    title,
    category,
    audience,
    last_updated,
    tags,
    related,
  };
  
  // マージ
  const mergedFm = mergeFrontmatter(existingFm, newFm);
  result.newFrontmatter = { ...mergedFm };
  
  // 変更チェック
  const newFmText = stringifyFrontmatter(mergedFm);
  if (fmText === newFmText) {
    result.status = 'no-changes';
    result.reason = 'no changes needed';
    return result;
  }
  
  // 新しいコンテンツ生成
  let newContent: string;
  if (hasFrontmatter) {
    // 既存のfrontmatterを置換
    newContent = `---\n${newFmText}\n---\n${body}`;
  } else {
    // frontmatterを追加
    newContent = `---\n${newFmText}\n---\n${content}`;
  }
  
  result.status = hasFrontmatter ? 'updated' : 'added';
  
  // 書き込み（dry-runでなければ）
  if (!options.dryRun) {
    try {
      writeFileSync(filePath, newContent, 'utf8');
      if (options.verbose) {
        console.log(`✓ ${relative(process.cwd(), filePath)}: ${result.status}`);
      }
    } catch (e) {
      result.status = 'skipped';
      result.reason = 'cannot write file';
      return result;
    }
  } else {
    if (options.verbose) {
      console.log(`[DRY-RUN] ${relative(process.cwd(), filePath)}: ${result.status}`);
    }
  }
  
  return result;
}

/**
 * ディレクトリを再帰的に走査
 */
function walkDir(dir: string, callback: (filePath: string) => void): void {
  const files = readdirSync(dir);
  for (const file of files) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else if (file.endsWith('.md')) {
      callback(fullPath);
    }
  }
}

// ============================================================================
// メイン処理
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  // オプション解析
  const options = {
    dryRun: false,
    verbose: false,
    date: new Date().toISOString().split('T')[0],
    skipExisting: false,
  };
  
  const files: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--skip-existing') {
      options.skipExisting = true;
    } else if (arg === '--date') {
      options.date = args[++i];
    } else if (!arg.startsWith('--')) {
      files.push(arg);
    }
  }
  
  // ターゲットファイル決定
  const targets: string[] = files.length > 0 ? files : [];
  if (targets.length === 0) {
    walkDir('docs', (filePath) => targets.push(filePath));
  }
  
  // 処理実行
  const results: FileResult[] = [];
  for (const filePath of targets) {
    const result = processFile(filePath, options);
    results.push(result);
  }
  
  // 結果集計
  const byStatus: Record<string, FileResult[]> = {};
  for (const result of results) {
    if (!byStatus[result.status]) {
      byStatus[result.status] = [];
    }
    byStatus[result.status].push(result);
  }
  
  // 出力
  console.log('\n=== Frontmatter 処理結果 ===\n');
  
  for (const status of ['added', 'updated', 'no-changes', 'skipped']) {
    const items = byStatus[status] || [];
    if (items.length > 0) {
      console.log(`${status.toUpperCase()}: ${items.length}`);
      if (options.verbose || status === 'added' || status === 'updated') {
        for (const item of items) {
          console.log(`  - ${relative(process.cwd(), item.filePath)}`);
          if (item.reason) {
            console.log(`    (${item.reason})`);
          }
        }
      }
    }
  }
  
  console.log(`\n合計: ${results.length} ファイル処理`);
  
  if (options.dryRun) {
    console.log('\n[DRY-RUN] 実際の変更は適用されませんでした。--dry-runを外して実行してください。');
  }
}

main().catch(console.error);
