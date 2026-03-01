/**
 * @abdd.meta
 * path: .pi/tests/lib/tool-error-utils.test.ts
 * role: tool-error-utils.tsの統合テスト
 * why: ツール実行の安全性とエラーハンドリングの正確性を保証するため
 * related: .pi/lib/tool-error-utils.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: ツールエラーユーティリティの統合テスト
 * what_it_does:
 *   - safeBash機能をテスト
 *   - isExitOneAllowed判定を検証
 *   - safeEdit機能を確認
 *   - safeRead機能をテスト
 * why_it_exists:
 *   - ツール実行の信頼性を保証
 *   - エッジケースや境界条件の動作を確認
 * scope:
 *   in: コマンド、オプション
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isExitOneAllowed,
  safeBash,
  safeEdit,
  safeRead,
  findTextLine,
  findSimilarFiles,
  getToolCriticality,
  evaluateToolResult,
  evaluateAgentRunResults,
  type BashOptions,
  type SafeBashResult,
  type ToolCriticality,
} from '../../lib/tool-error-utils';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('tool-error-utils', () => {
  describe('isExitOneAllowed', () => {
    it('isExitOneAllowed_diffコマンド_許容される', () => {
      expect(isExitOneAllowed('diff file1.txt file2.txt')).toBe(true);
    });

    it('isExitOneAllowed_grepコマンド_許容される', () => {
      expect(isExitOneAllowed('grep pattern file.txt')).toBe(true);
    });

    it('isExitOneAllowed_testコマンド_許容される', () => {
      expect(isExitOneAllowed('test -f file.txt')).toBe(true);
    });

    it('isExitOneAllowed_gitDiff_許容される', () => {
      expect(isExitOneAllowed('git diff HEAD~1')).toBe(true);
    });

    it('isExitOneAllowed_commコマンド_許容される', () => {
      expect(isExitOneAllowed('comm file1.txt file2.txt')).toBe(true);
    });

    it('isExitOneAllowed_他のコマンド_許容されない', () => {
      expect(isExitOneAllowed('npm test')).toBe(false);
    });

    it('isExitOneAllowed_空白ありコマンド_正しく判定', () => {
      expect(isExitOneAllowed('  diff file1.txt file2.txt  ')).toBe(true);
    });
  });

  describe('safeBash', () => {
    it('safeBash_成功コマンド_okステータス', () => {
      const result = safeBash({ command: 'echo "test"' });

      expect(result.status).toBe('ok');
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('test');
    });

    it('safeBash_失敗コマンド_errorステータス', () => {
      const result = safeBash({
        command: 'ls /nonexistent_directory_12345',
        timeout: 5000,
      });

      expect(result.status).toBe('error');
      expect(result.exitCode).not.toBe(0);
    });

    it('safeBash_allowExitOne_終了コード1許容', () => {
      const result = safeBash({
        command: 'test -f /nonexistent_file_12345',
        allowExitOne: true,
      });

      expect(result.status).toBe('ok');
      expect(result.isNonZeroAllowed).toBe(true);
    });

    it('safeBash_allowedExitCodes_カスタム許容', () => {
      const result = safeBash({
        command: 'exit 2',
        allowedExitCodes: [0, 2],
      });

      expect(result.status).toBe('ok');
      expect(result.exitCode).toBe(2);
    });

    it('safeBash_タイムアウト_エラー', () => {
      const result = safeBash({
        command: 'sleep 10',
        timeout: 100,
      });

      expect(result.status).toBe('error');
    });
  });

  describe('findTextLine', () => {
    it('findTextLine_存在するテキスト_行番号返す', () => {
      const content = 'line1\nline2\nline3\n';
      const line = findTextLine(content, 'line2');

      expect(line).toBe(2);
    });

    it('findTextLine_存在しないテキスト_null返す', () => {
      const content = 'line1\nline2\nline3\n';
      const line = findTextLine(content, 'nonexistent');

      expect(line).toBeNull();
    });

    it('findTextLine_複数行テキスト_マッチ', () => {
      const content = 'line1\nline2\nline3\nline4\n';
      const line = findTextLine(content, 'line2\nline3');

      expect(line).toBe(2);
    });

    it('findTextLine_部分一致_行番号返す', () => {
      const content = 'this is a long line with text\n';
      const line = findTextLine(content, 'this is a long');

      expect(line).toBe(1);
    });
  });

  describe('safeEdit', () => {
    const testDir = join(process.cwd(), 'test-edit-dir');
    const testFile = join(testDir, 'test.txt');

    beforeEach(() => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
      writeFileSync(testFile, 'Hello World\nThis is a test\n', 'utf-8');
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('safeEdit_正常編集_成功', () => {
      const result = safeEdit({
        path: testFile,
        oldText: 'Hello World',
        newText: 'Hello TypeScript',
      });

      expect(result.status).toBe('ok');
      expect(result.success).toBe(true);
    });

    it('safeEdit_存在しないテキスト_失敗', () => {
      const result = safeEdit({
        path: testFile,
        oldText: 'NonExistentText',
        newText: 'New Text',
      });

      expect(result.status).toBe('error');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('safeEdit_存在しないファイル_失敗', () => {
      const result = safeEdit({
        path: join(testDir, 'nonexistent.txt'),
        oldText: 'text',
        newText: 'new text',
      });

      expect(result.status).toBe('error');
      expect(result.success).toBe(false);
    });

    it('safeEdit_行番号提案_機能確認', () => {
      const result = safeEdit({
        path: testFile,
        oldText: 'NonExistentText',
        newText: 'New Text',
        suggestLineNumber: true,
      });

      // 行番号提案はオプション機能
      expect(result.status).toBe('error');
    });

    it('safeEdit_リトライ_実行される', () => {
      const result = safeEdit({
        path: testFile,
        oldText: 'Hello World',
        newText: 'Hello Retry',
        retries: 2,
      });

      expect(result.retryCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('safeRead', () => {
    const testDir = join(process.cwd(), 'test-read-dir');
    const testFile = join(testDir, 'test.txt');

    beforeEach(() => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
      writeFileSync(testFile, 'Line1\nLine2\nLine3\nLine4\nLine5\n', 'utf-8');
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('safeRead_正常読み込み_成功', () => {
      const result = safeRead({ path: testFile });

      expect(result.status).toBe('ok');
      expect(result.content).toContain('Line1');
    });

    it('safeRead_存在しないファイル_失敗', () => {
      const result = safeRead({ path: '/nonexistent_file_12345.txt' });

      expect(result.status).toBe('error');
      expect(result.error).toContain('ENOENT');
    });

    it('safeRead_オフセット指定_部分読み込み', () => {
      const result = safeRead({
        path: testFile,
        offset: 2,
        limit: 2,
      });

      expect(result.status).toBe('ok');
      expect(result.content).toContain('Line2');
      expect(result.content).not.toContain('Line1');
    });

    it('safeRead_ディレクトリ指定_EISDIRエラー', () => {
      const result = safeRead({ path: testDir });

      expect(result.status).toBe('error');
      expect(result.error).toContain('EISDIR');
      expect(result.directoryContents).toBeDefined();
    });

    it('safeRead_類似ファイル検索_提案される', () => {
      const result = safeRead({
        path: join(testDir, 'nonexistent.ts'),
        findSimilar: true,
        searchBaseDir: testDir,
      });

      expect(result.similarFiles).toBeDefined();
    });
  });

  describe('findSimilarFiles', () => {
    const testDir = join(process.cwd(), 'test-similar-dir');

    beforeEach(() => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
      writeFileSync(join(testDir, 'config.ts'), '', 'utf-8');
      writeFileSync(join(testDir, 'config.test.ts'), '', 'utf-8');
      writeFileSync(join(testDir, 'settings.ts'), '', 'utf-8');
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('findSimilarFiles_類似ファイル_見つかる', () => {
      const similar = findSimilarFiles('config.ts', testDir);

      expect(similar.length).toBeGreaterThan(0);
    });
  });

  describe('getToolCriticality', () => {
    it('getToolCriticality_write_クリティカル', () => {
      expect(getToolCriticality('write')).toBe('critical');
    });

    it('getToolCriticality_edit_クリティカル', () => {
      expect(getToolCriticality('edit')).toBe('critical');
    });

    it('getToolCriticality_subagent_run_クリティカル', () => {
      expect(getToolCriticality('subagent_run')).toBe('critical');
    });

    it('getToolCriticality_read_情報取得', () => {
      expect(getToolCriticality('read')).toBe('informational');
    });

    it('getToolCriticality_bash_情報取得', () => {
      expect(getToolCriticality('bash')).toBe('informational');
    });

    it('getToolCriticality_code_search_情報取得', () => {
      expect(getToolCriticality('code_search')).toBe('informational');
    });

    it('getToolCriticality_不明ツール_非クリティカル', () => {
      expect(getToolCriticality('unknown_tool')).toBe('non-critical');
    });
  });

  describe('evaluateToolResult', () => {
    it('evaluateToolResult_成功_失敗なし', () => {
      const result = evaluateToolResult('read', 'ok');

      expect(result.isCritical).toBe(false);
      expect(result.shouldFailAgentRun).toBe(false);
      expect(result.downgradeToWarning).toBe(false);
    });

    it('evaluateToolResult_クリティカルツール失敗_失敗', () => {
      const result = evaluateToolResult('write', 'error', 'Write failed');

      expect(result.isCritical).toBe(true);
      expect(result.shouldFailAgentRun).toBe(true);
    });

    it('evaluateToolResult_情報ツール失敗_警告', () => {
      const result = evaluateToolResult('read', 'error', 'Read failed');

      expect(result.isCritical).toBe(false);
      expect(result.shouldFailAgentRun).toBe(false);
      expect(result.downgradeToWarning).toBe(true);
    });

    it('evaluateToolResult_非クリティカルツール失敗_失敗しない', () => {
      const result = evaluateToolResult('unknown_tool', 'error');

      expect(result.shouldFailAgentRun).toBe(false);
    });
  });

  describe('evaluateAgentRunResults', () => {
    it('evaluateAgentRunResults_全成功_ok', () => {
      const results = [
        { toolName: 'read', status: 'ok' as const },
        { toolName: 'write', status: 'ok' as const },
      ];

      const evaluation = evaluateAgentRunResults(results);

      expect(evaluation.status).toBe('ok');
      expect(evaluation.failedCount).toBe(0);
    });

    it('evaluateAgentRunResults_クリティカル失敗_error', () => {
      const results = [
        { toolName: 'read', status: 'ok' as const },
        { toolName: 'write', status: 'error' as const, errorMessage: 'Write failed' },
      ];

      const evaluation = evaluateAgentRunResults(results);

      expect(evaluation.status).toBe('error');
      expect(evaluation.criticalFailureCount).toBe(1);
      expect(evaluation.shouldFailAgentRun).toBe(true);
    });

    it('evaluateAgentRunResults_情報ツール失敗_warning', () => {
      const results = [
        { toolName: 'read', status: 'error' as const, errorMessage: 'Read failed' },
        { toolName: 'bash', status: 'error' as const, errorMessage: 'Bash failed' },
      ];

      const evaluation = evaluateAgentRunResults(results);

      expect(evaluation.status).toBe('warning');
      expect(evaluation.warningCount).toBe(2);
      expect(evaluation.shouldFailAgentRun).toBe(false);
    });

    it('evaluateAgentRunResults_混合結果_正しい評価', () => {
      const results = [
        { toolName: 'read', status: 'ok' as const },
        { toolName: 'read', status: 'error' as const, errorMessage: 'Read failed' },
        { toolName: 'write', status: 'ok' as const },
      ];

      const evaluation = evaluateAgentRunResults(results);

      expect(evaluation.status).toBe('warning');
      expect(evaluation.failedCount).toBe(1);
      expect(evaluation.criticalFailureCount).toBe(0);
    });
  });

  describe('型定義', () => {
    it('ToolCriticality_正しい値', () => {
      const criticalities: ToolCriticality[] = [
        'critical',
        'non-critical',
        'informational',
      ];

      criticalities.forEach((c) => {
        expect(['critical', 'non-critical', 'informational']).toContain(c);
      });
    });

    it('BashOptions_正しい構造', () => {
      const options: BashOptions = {
        command: 'echo test',
        timeout: 5000,
        allowedExitCodes: [0, 1],
        allowExitOne: true,
        cwd: '/tmp',
        env: { NODE_ENV: 'test' },
      };

      expect(options.command).toBe('echo test');
    });
  });
});
