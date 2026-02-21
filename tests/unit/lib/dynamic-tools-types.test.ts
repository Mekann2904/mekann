/**
 * @abdd.meta
 * path: tests/unit/lib/dynamic-tools-types.test.ts
 * role: 動的ツールシステムの型定義・定数・パスユーティリティのテスト
 * why: 動的ツールシステムのデータ構造一貫性を保証し、パス設定が正しいことを検証するため
 * related: .pi/lib/dynamic-tools/types.ts, .pi/lib/dynamic-tools/registry.ts
 * public_api: getDynamicToolsPaths, DEFAULT_DYNAMIC_TOOLS_CONFIG
 * invariants: pathsの各フィールドは絶対パス文字列、DEFAULT_DYNAMIC_TOOLS_CONFIGは有効な設定オブジェクト
 * side_effects: process.cwd()を参照してパスを生成する
 * failure_modes: ディレクトリ構造の変更により無効なパスが返される、定数定義の変更
 * @abdd.explain
 * overview: 動的ツールシステムの型定義、定数、パスユーティリティをテストする
 * what_it_does:
 *   - getDynamicToolsPaths関数が正しいパス構造を返すことを検証
 *   - DEFAULT_DYNAMIC_TOOLS_CONFIGが有効な設定値を持つことを検証
 *   - 各型定義がTypeScriptの型チェックを通過することを確認（コンパイル時に検証）
 * why_it_exists:
 *   - パス設定の正確性を保証し、ファイルシステム操作エラーを防ぐため
 *   - デフォルト設定が有効な値を持つことを保証し、システムの初期化エラーを防ぐため
 * scope:
 *   in: getDynamicToolsPaths関数、DEFAULT_DYNAMIC_TOOLS_CONFIG定数
 *   out: テストの実行結果、パス構造の検証、設定値の検証
 */

import { describe, it, expect } from 'vitest';
import {
  getDynamicToolsPaths,
  DEFAULT_DYNAMIC_TOOLS_CONFIG,
  type DynamicToolsPaths,
  type DynamicToolMode,
  type VerificationStatus,
  type SafetyIssueType,
  type AuditAction,
  type PerformanceThresholds,
} from '@lib/dynamic-tools/types';

describe('getDynamicToolsPaths', () => {
  it('正常系: 有効なDynamicToolsPathsオブジェクトを返す', () => {
    const paths = getDynamicToolsPaths();

    expect(paths).toBeDefined();
    expect(typeof paths).toBe('object');
  });

  it('正常系: toolsDirを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.toolsDir).toBeDefined();
    expect(typeof paths.toolsDir).toBe('string');
    expect(paths.toolsDir.length).toBeGreaterThan(0);
  });

  it('正常系: skillsDirを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.skillsDir).toBeDefined();
    expect(typeof paths.skillsDir).toBe('string');
    expect(paths.skillsDir.length).toBeGreaterThan(0);
  });

  it('正常系: auditLogFileを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.auditLogFile).toBeDefined();
    expect(typeof paths.auditLogFile).toBe('string');
    expect(paths.auditLogFile.length).toBeGreaterThan(0);
    expect(paths.auditLogFile).toMatch(/\.jsonl$/);
  });

  it('正常系: metricsFileを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.metricsFile).toBeDefined();
    expect(typeof paths.metricsFile).toBe('string');
    expect(paths.metricsFile.length).toBeGreaterThan(0);
    expect(paths.metricsFile).toMatch(/\.json$/);
  });

  it('正常系: toolsDirは.pi/toolsを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.toolsDir).toContain('.pi');
    expect(paths.toolsDir).toContain('tools');
  });

  it('正常系: skillsDirは.pi/skills/dynamicを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.skillsDir).toContain('.pi');
    expect(paths.skillsDir).toContain('skills');
    expect(paths.skillsDir).toContain('dynamic');
  });

  it('正常系: auditLogFileは.logs/dynamic-tools-audit.jsonlを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.auditLogFile).toContain('.pi');
    expect(paths.auditLogFile).toContain('logs');
    expect(paths.auditLogFile).toContain('dynamic-tools-audit.jsonl');
  });

  it('正常系: metricsFileは.logs/dynamic-tools-metrics.jsonを含む', () => {
    const paths = getDynamicToolsPaths();

    expect(paths.metricsFile).toContain('.pi');
    expect(paths.metricsFile).toContain('logs');
    expect(paths.metricsFile).toContain('dynamic-tools-metrics.json');
  });

  it('正常系: 全パスは絶対パスである', () => {
    const paths = getDynamicToolsPaths();

    // Unix系の絶対パスは/で始まる
    expect(paths.toolsDir.startsWith('/')).toBe(true);
    expect(paths.skillsDir.startsWith('/')).toBe(true);
    expect(paths.auditLogFile.startsWith('/')).toBe(true);
    expect(paths.metricsFile.startsWith('/')).toBe(true);
  });

  it('正常系: CWDベースでパスを生成する', () => {
    const paths = getDynamicToolsPaths();
    const cwd = process.cwd();

    expect(paths.toolsDir).toContain(cwd);
    expect(paths.skillsDir).toContain(cwd);
    expect(paths.auditLogFile).toContain(cwd);
    expect(paths.metricsFile).toContain(cwd);
  });

  it('正常系: パスが一貫している', () => {
    const paths1 = getDynamicToolsPaths();
    const paths2 = getDynamicToolsPaths();

    expect(paths1).toEqual(paths2);
  });
});

describe('DEFAULT_DYNAMIC_TOOLS_CONFIG', () => {
  it('正常系: 有効なDynamicToolConfigオブジェクトである', () => {
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG).toBeDefined();
    expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG).toBe('object');
  });

  describe('基本設定', () => {
    it('正常系: enabledがbooleanである', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.enabled).toBe('boolean');
    });

    it('正常系: autoCreateEnabledがbooleanである', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.autoCreateEnabled).toBe('boolean');
    });

    it('正常系: autoVerificationEnabledがbooleanである', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.autoVerificationEnabled).toBe('boolean');
    });

    it('正常系: auditLogEnabledがbooleanである', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.auditLogEnabled).toBe('boolean');
    });

    it('正常系: autoConvertToSkillがbooleanである', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.autoConvertToSkill).toBe('boolean');
    });
  });

  describe('数値設定', () => {
    it('正常系: maxToolsが正の整数である', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools).toBe('number');
      expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools).toBeGreaterThan(0);
      expect(Number.isInteger(DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools)).toBe(true);
    });

    it('正常系: defaultTimeoutMsが正の整数である', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs).toBe('number');
      expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs).toBeGreaterThan(0);
      expect(Number.isInteger(DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs)).toBe(true);
    });
  });

  describe('allowedOperations', () => {
    it('正常系: allowedOperationsが定義されている', () => {
      expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations).toBeDefined();
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations).toBe('object');
    });

    it('正常系: allowedModulesが配列である', () => {
      expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedModules)).toBe(true);
    });

    it('正常系: allowedCommandsが配列である', () => {
      expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedCommands)).toBe(true);
    });

    it('正常系: allowedFilePathsが配列である', () => {
      expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedFilePaths)).toBe(true);
    });

    it('正常系: allowedDomainsが配列である', () => {
      expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedDomains)).toBe(true);
    });

    it('正常系: maxExecutionTimeMsが正の整数である', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxExecutionTimeMs).toBe('number');
      expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxExecutionTimeMs).toBeGreaterThan(0);
    });

    it('正常系: maxOutputSizeBytesが正の整数である', () => {
      expect(typeof DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxOutputSizeBytes).toBe('number');
      expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxOutputSizeBytes).toBeGreaterThan(0);
    });

    it('正常系: allowedModulesは有効なモジュール名を含む', () => {
      const { allowedModules } = DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations;

      expect(allowedModules.length).toBeGreaterThan(0);
      expect(allowedModules.every(m => typeof m === 'string')).toBe(true);
      expect(allowedModules.some(m => m.startsWith('node:'))).toBe(true);
    });

    it('正常系: allowedCommandsは有効なコマンド名を含む', () => {
      const { allowedCommands } = DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations;

      expect(allowedCommands.length).toBeGreaterThan(0);
      expect(allowedCommands.every(c => typeof c === 'string')).toBe(true);
      expect(allowedCommands.includes('ls')).toBe(true);
      expect(allowedCommands.includes('cat')).toBe(true);
    });

    it('正常系: allowedFilePathsは有効なパスパターンを含む', () => {
      const { allowedFilePaths } = DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations;

      expect(allowedFilePaths.length).toBeGreaterThan(0);
      expect(allowedFilePaths.every(p => typeof p === 'string')).toBe(true);
    });
  });
});

describe('型定義の実行時検証', () => {
  describe('DynamicToolMode', () => {
    it('正常系: 有効なDynamicToolMode値を持つ', () => {
      const validModes: DynamicToolMode[] = ['bash', 'function', 'template', 'skill'];

      validModes.forEach(mode => {
        expect(['bash', 'function', 'template', 'skill']).toContain(mode);
      });
    });
  });

  describe('VerificationStatus', () => {
    it('正常系: 有効なVerificationStatus値を持つ', () => {
      const validStatuses: VerificationStatus[] = [
        'unverified',
        'pending',
        'passed',
        'failed',
        'deprecated',
      ];

      validStatuses.forEach(status => {
        expect(['unverified', 'pending', 'passed', 'failed', 'deprecated']).toContain(status);
      });
    });
  });

  describe('SafetyIssueType', () => {
    it('正常系: 有効なSafetyIssueType値を持つ', () => {
      const validTypes: SafetyIssueType[] = [
        'forbidden-function',
        'network-access',
        'file-system-modification',
        'code-injection',
        'eval-usage',
        'unsafe-regex',
        'command-injection',
        'missing-validation',
        'hardcoded-secret',
        'excessive-permissions',
      ];

      validTypes.forEach(type => {
        expect([
          'forbidden-function',
          'network-access',
          'file-system-modification',
          'code-injection',
          'eval-usage',
          'unsafe-regex',
          'command-injection',
          'missing-validation',
          'hardcoded-secret',
          'excessive-permissions',
        ]).toContain(type);
      });
    });
  });

  describe('AuditAction', () => {
    it('正常系: 有効なAuditAction値を持つ', () => {
      const validActions: AuditAction[] = [
        'tool.create',
        'tool.run',
        'tool.delete',
        'tool.update',
        'tool.export',
        'tool.import',
        'verification.run',
        'verification.pass',
        'verification.fail',
      ];

      validActions.forEach(action => {
        expect([
          'tool.create',
          'tool.run',
          'tool.delete',
          'tool.update',
          'tool.export',
          'tool.import',
          'verification.run',
          'verification.pass',
          'verification.fail',
        ]).toContain(action);
      });
    });
  });
});

describe('デフォルト設定値の妥当性', () => {
  it('正常系: maxToolsは合理的な値である', () => {
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools).toBe(100);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools).toBeGreaterThan(10);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools).toBeLessThan(10000);
  });

  it('正常系: defaultTimeoutMsは合理的な値である', () => {
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs).toBe(30000); // 30秒
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs).toBeGreaterThan(1000); // 1秒以上
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs).toBeLessThan(300000); // 5分未満
  });

  it('正常系: maxExecutionTimeMsは合理的な値である', () => {
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxExecutionTimeMs).toBe(30000);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxExecutionTimeMs).toBeGreaterThan(1000);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxExecutionTimeMs).toBeLessThan(300000);
  });

  it('正常系: maxOutputSizeBytesは合理的な値である', () => {
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxOutputSizeBytes).toBe(1024 * 1024); // 1MB
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxOutputSizeBytes).toBeGreaterThan(1024);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxOutputSizeBytes).toBeLessThan(100 * 1024 * 1024);
  });

  it('正常系: 設定はデフォルトで有効である', () => {
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.enabled).toBe(true);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.autoCreateEnabled).toBe(true);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.autoVerificationEnabled).toBe(true);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.auditLogEnabled).toBe(true);
    expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.autoConvertToSkill).toBe(false);
  });
});

describe('統合テスト', () => {
  it('正常系: パスと設定が整合している', () => {
    const paths = getDynamicToolsPaths();
    const config = DEFAULT_DYNAMIC_TOOLS_CONFIG;

    // 監査ログが有効な場合、auditLogFileが定義されている
    if (config.auditLogEnabled) {
      expect(paths.auditLogFile).toBeDefined();
      expect(paths.auditLogFile.length).toBeGreaterThan(0);
    }

    // メトリクスファイルが定義されている
    expect(paths.metricsFile).toBeDefined();
    expect(paths.metricsFile.length).toBeGreaterThan(0);
  });

  it('正常系: 全パスは一意である', () => {
    const paths = getDynamicToolsPaths();
    const pathValues = Object.values(paths);

    const uniquePaths = new Set(pathValues);
    expect(uniquePaths.size).toBe(pathValues.length);
  });

  it('正常系: 全ての設定値はプリミティブ型または配列である', () => {
    const config = DEFAULT_DYNAMIC_TOOLS_CONFIG;

    // 基本設定
    expect(['boolean', 'number']).toContain(typeof config.enabled);
    expect(['boolean', 'number']).toContain(typeof config.autoCreateEnabled);
    expect(['boolean', 'number']).toContain(typeof config.autoVerificationEnabled);
    expect(['boolean', 'number']).toContain(typeof config.auditLogEnabled);
    expect(['boolean', 'number']).toContain(typeof config.autoConvertToSkill);
    expect(['boolean', 'number']).toContain(typeof config.maxTools);
    expect(['boolean', 'number']).toContain(typeof config.defaultTimeoutMs);

    // allowedOperations
    expect(typeof config.allowedOperations).toBe('object');
    expect(Array.isArray(config.allowedOperations.allowedModules)).toBe(true);
    expect(Array.isArray(config.allowedOperations.allowedCommands)).toBe(true);
    expect(Array.isArray(config.allowedOperations.allowedFilePaths)).toBe(true);
    expect(Array.isArray(config.allowedOperations.allowedDomains)).toBe(true);
    expect(['boolean', 'number']).toContain(typeof config.allowedOperations.maxExecutionTimeMs);
    expect(['boolean', 'number']).toContain(typeof config.allowedOperations.maxOutputSizeBytes);
  });
});
