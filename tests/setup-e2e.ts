/**
 * @file E2Eテスト用セットアップファイル
 * @description E2Eテスト実行環境の初期化とクリーンアップ
 * @category e2e
 */

import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, afterAll, beforeEach, beforeAll } from 'vitest';

// ============================================================================
// 環境変数設定
// ============================================================================

const E2E_TEMP_DIR = join(tmpdir(), 'mekann-e2e-tests');

process.env.NODE_ENV = 'test';
process.env.PI_TEST_MODE = 'e2e';
process.env.PI_E2E_TEMP_DIR = E2E_TEMP_DIR;

// ============================================================================
// テスト用一時ディレクトリ管理
// ============================================================================

function ensureE2ETempDir(): void {
  if (!existsSync(E2E_TEMP_DIR)) {
    mkdirSync(E2E_TEMP_DIR, { recursive: true });
  }
}

function cleanupE2ETempDir(): void {
  if (existsSync(E2E_TEMP_DIR)) {
    try {
      rmSync(E2E_TEMP_DIR, { recursive: true, force: true });
    } catch (error) {
      // Cleanup best effort
      console.warn('Failed to cleanup E2E temp directory:', error);
    }
  }
}

// ============================================================================
// グローバルセットアップとクリーンアップ
// ============================================================================

beforeAll(() => {
  ensureE2ETempDir();
});

afterAll(() => {
  cleanupE2ETempDir();
});

// 各テストの前にクリーンアップ（必要に応じて）
beforeEach(() => {
  ensureE2ETempDir();
});

afterEach(() => {
  // 個別のテスト用ディレクトリのクリーンアップは
  // 各テストファイルで行う
});

// ============================================================================
// E2Eテスト用ユーティリティのエクスポート
// ============================================================================

export { E2E_TEMP_DIR };

export function getE2ETestPath(...segments: string[]): string {
  return join(E2E_TEMP_DIR, ...segments);
}

export function createE2ETestDir(testName: string): string {
  const testDir = join(E2E_TEMP_DIR, testName);
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  return testDir;
}

export function cleanupE2ETestDir(testDir: string): void {
  if (existsSync(testDir)) {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch (error) {
      // Cleanup best effort
      console.warn(`Failed to cleanup test directory: ${testDir}`, error);
    }
  }
}
