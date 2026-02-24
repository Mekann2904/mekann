/**
 * @abdd.meta
 * path: tests/unit/lib/dynamic-tools/types.test.ts
 * role: 動的ツールシステムの型定義とパス生成のテスト
 * why: 型安全性とパス生成の正確性を保証するため
 * related: .pi/lib/dynamic-tools/types.ts
 * public_api: getDynamicToolsPaths, DEFAULT_DYNAMIC_TOOLS_CONFIG
 * invariants: パスは常に文字列、DEFAULT_DYNAMIC_TOOLS_CONFIGは固定値
 * side_effects: なし（純粋な型定義とパス生成のみ）
 * failure_modes: process.cwd()権限エラー、パス文字列の不正
 * @abdd.explain
 * overview: 動的ツールシステムの型定義とパス生成関数をテストする
 * what_it_does:
 *   - getDynamicToolsPaths関数のパス生成をテスト
 *   - DEFAULT_DYNAMIC_TOOLS_CONFIGの値を検証
 *   - 各種インターフェースの型整合性を確認
 * why_it_exists:
 *   - パス設定の正確性を保証し、ファイルシステム操作のエラーを防ぐため
 * scope:
 *   in: getDynamicToolsPaths関数、DEFAULT_DYNAMIC_TOOLS_CONFIG
 *   out: テストの実行結果
 */

import { describe, it, expect } from 'vitest';
import {
	getDynamicToolsPaths,
	DEFAULT_DYNAMIC_TOOLS_CONFIG,
	type DynamicToolsPaths,
	type DynamicToolMode,
	type ToolParameterDefinition,
	type DynamicToolDefinition,
	type VerificationStatus,
	type DynamicToolResult,
	type DynamicToolRunOptions,
	type DynamicToolRegistrationRequest,
	type DynamicToolRegistrationResult,
	type DynamicToolListOptions,
	type SafetyVerificationResult,
	type SafetyIssue,
	type SafetyIssueType,
	type AllowedOperations,
	type DynamicToolQualityMetrics,
	type QualityMetricsReport,
	type AuditLogEntry,
	type AuditAction,
	type ConvertToSkillOptions,
	type ConvertToSkillResult,
	type ToolReflectionResult,
	type ToolReflectionContext,
	type DynamicToolsConfig,
} from '@lib/dynamic-tools/types';

describe('getDynamicToolsPaths', () => {
	describe('パス生成', () => {
		it('正常系: 必須プロパティを含むオブジェクトを返す', () => {
			const paths = getDynamicToolsPaths();

			expect(paths).toHaveProperty('toolsDir');
			expect(paths).toHaveProperty('skillsDir');
			expect(paths).toHaveProperty('auditLogFile');
			expect(paths).toHaveProperty('metricsFile');
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

		it('正常系: auditLogFileはlogsディレクトリを含む', () => {
			const paths = getDynamicToolsPaths();

			expect(paths.auditLogFile).toContain('logs');
			expect(paths.auditLogFile).toContain('dynamic-tools-audit.jsonl');
		});

		it('正常系: metricsFileはlogsディレクトリを含む', () => {
			const paths = getDynamicToolsPaths();

			expect(paths.metricsFile).toContain('logs');
			expect(paths.metricsFile).toContain('dynamic-tools-metrics.json');
		});

		it('正常系: すべてのパスが文字列型', () => {
			const paths = getDynamicToolsPaths();

			expect(typeof paths.toolsDir).toBe('string');
			expect(typeof paths.skillsDir).toBe('string');
			expect(typeof paths.auditLogFile).toBe('string');
			expect(typeof paths.metricsFile).toBe('string');
		});

		it('正常系: すべてのパスが空でない', () => {
			const paths = getDynamicToolsPaths();

			expect(paths.toolsDir.length).toBeGreaterThan(0);
			expect(paths.skillsDir.length).toBeGreaterThan(0);
			expect(paths.auditLogFile.length).toBeGreaterThan(0);
			expect(paths.metricsFile.length).toBeGreaterThan(0);
		});
	});

	describe('パス一貫性', () => {
		it('正常系: 複数回呼び出しても同じ結果を返す', () => {
			const paths1 = getDynamicToolsPaths();
			const paths2 = getDynamicToolsPaths();

			expect(paths1).toEqual(paths2);
		});

		it('正常系: パスは絶対パスまたは相対パスとして有効', () => {
			const paths = getDynamicToolsPaths();

			// すべてのパスが少なくともピリオドまたはスラッシュで始まるか、
			// または有効なパス文字を含むことを確認
			const isValidPath = (path: string) => path.length > 0 && !path.includes('\0');

			expect(isValidPath(paths.toolsDir)).toBe(true);
			expect(isValidPath(paths.skillsDir)).toBe(true);
			expect(isValidPath(paths.auditLogFile)).toBe(true);
			expect(isValidPath(paths.metricsFile)).toBe(true);
		});
	});
});

describe('DEFAULT_DYNAMIC_TOOLS_CONFIG', () => {
	describe('基本設定', () => {
		it('正常系: enabledはtrue', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.enabled).toBe(true);
		});

		it('正常系: autoCreateEnabledはtrue', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.autoCreateEnabled).toBe(true);
		});

		it('正常系: autoVerificationEnabledはtrue', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.autoVerificationEnabled).toBe(true);
		});

		it('正常系: maxToolsは100', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools).toBe(100);
		});

		it('正常系: defaultTimeoutMsは30000', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs).toBe(30000);
		});

		it('正常系: auditLogEnabledはtrue', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.auditLogEnabled).toBe(true);
		});

		it('正常系: autoConvertToSkillはfalse', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.autoConvertToSkill).toBe(false);
		});
	});

	describe('allowedOperations', () => {
		it('正常系: allowedModulesは配列', () => {
			expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedModules)).toBe(true);
		});

		it('正常系: allowedCommandsは配列', () => {
			expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedCommands)).toBe(true);
		});

		it('正常系: allowedFilePathsは配列', () => {
			expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedFilePaths)).toBe(true);
		});

		it('正常系: allowedDomainsは配列', () => {
			expect(Array.isArray(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedDomains)).toBe(true);
		});

		it('正常系: maxExecutionTimeMsは30000', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxExecutionTimeMs).toBe(30000);
		});

		it('正常系: maxOutputSizeBytesは1MB', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.maxOutputSizeBytes).toBe(1024 * 1024);
		});

		it('正常系: 基本的なNode.jsモジュールが含まれる', () => {
			const modules = DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedModules;

			expect(modules).toContain('node:fs');
			expect(modules).toContain('node:path');
			expect(modules).toContain('node:os');
		});

		it('正常系: 安全なbashコマンドが含まれる', () => {
			const commands = DEFAULT_DYNAMIC_TOOLS_CONFIG.allowedOperations.allowedCommands;

			expect(commands).toContain('ls');
			expect(commands).toContain('cat');
			expect(commands).toContain('grep');
		});
	});
});

describe('Type Definitions', () => {
	describe('DynamicToolMode', () => {
		it('型ガード: 有効なモード値', () => {
			const validModes: DynamicToolMode[] = ['bash', 'function', 'template', 'skill'];

			validModes.forEach((mode) => {
				expect(['bash', 'function', 'template', 'skill']).toContain(mode);
			});
		});
	});

	describe('VerificationStatus', () => {
		it('型ガード: 有効なステータス値', () => {
			const validStatuses: VerificationStatus[] = ['unverified', 'pending', 'passed', 'failed', 'deprecated'];

			validStatuses.forEach((status) => {
				expect(['unverified', 'pending', 'passed', 'failed', 'deprecated']).toContain(status);
			});
		});
	});

	describe('ToolParameterDefinition', () => {
		it('正常系: 有効なパラメータ定義を作成できる', () => {
			const param: ToolParameterDefinition = {
				name: 'input',
				type: 'string',
				required: true,
				description: 'Input parameter',
			};

			expect(param.name).toBe('input');
			expect(param.type).toBe('string');
			expect(param.required).toBe(true);
		});

		it('正常系: オプションフィールドを含むパラメータ定義', () => {
			const param: ToolParameterDefinition = {
				name: 'count',
				type: 'number',
				required: false,
				description: 'Count parameter',
				default: 10,
				allowedValues: [1, 5, 10, 20],
			};

			expect(param.default).toBe(10);
			expect(param.allowedValues).toEqual([1, 5, 10, 20]);
		});
	});

	describe('DynamicToolDefinition', () => {
		it('正常系: 有効なツール定義を作成できる', () => {
			const tool: DynamicToolDefinition = {
				id: 'tool-123',
				name: 'test-tool',
				description: 'Test tool',
				mode: 'function',
				parameters: [],
				code: 'return 1;',
				createdAt: '2026-01-01T00:00:00Z',
				updatedAt: '2026-01-01T00:00:00Z',
				usageCount: 0,
				confidenceScore: 0.5,
				verificationStatus: 'unverified',
				tags: [],
				createdBy: 'test',
			};

			expect(tool.id).toBe('tool-123');
			expect(tool.confidenceScore).toBeGreaterThanOrEqual(0);
			expect(tool.confidenceScore).toBeLessThanOrEqual(1);
		});
	});

	describe('DynamicToolResult', () => {
		it('正常系: 成功結果を作成できる', () => {
			const result: DynamicToolResult = {
				success: true,
				output: 'Hello',
				executionTimeMs: 100,
				toolId: 'tool-123',
				runId: 'run-456',
				timestamp: '2026-01-01T00:00:00Z',
			};

			expect(result.success).toBe(true);
			expect(result.error).toBeUndefined();
		});

		it('正常系: エラー結果を作成できる', () => {
			const result: DynamicToolResult = {
				success: false,
				output: '',
				error: 'Something went wrong',
				executionTimeMs: 50,
				toolId: 'tool-123',
				runId: 'run-456',
				timestamp: '2026-01-01T00:00:00Z',
			};

			expect(result.success).toBe(false);
			expect(result.error).toBe('Something went wrong');
		});
	});

	describe('SafetyIssue', () => {
		it('正常系: 安全性問題を作成できる', () => {
			const issue: SafetyIssue = {
				type: 'eval-usage',
				severity: 'high',
				description: 'Use of eval() detected',
				location: { line: 10, column: 5 },
				suggestion: 'Avoid using eval()',
			};

			expect(issue.type).toBe('eval-usage');
			expect(issue.severity).toBe('high');
		});
	});

	describe('AuditLogEntry', () => {
		it('正常系: 監査ログエントリを作成できる', () => {
			const entry: AuditLogEntry = {
				id: 'log-123',
				timestamp: '2026-01-01T00:00:00Z',
				action: 'tool.create',
				actor: 'agent-1',
				details: {},
				success: true,
			};

			expect(entry.action).toBe('tool.create');
			expect(entry.success).toBe(true);
		});
	});
});

describe('Interface Constraints', () => {
	describe('confidenceScore範囲', () => {
		it('制約: confidenceScoreは0以上1以下', () => {
			// これは型レベルでは強制されないが、文書化された制約
			const validScores = [0, 0.5, 1];
			const invalidScores = [-0.1, 1.1];

			validScores.forEach((score) => {
				expect(score >= 0 && score <= 1).toBe(true);
			});

			invalidScores.forEach((score) => {
				expect(score >= 0 && score <= 1).toBe(false);
			});
		});
	});

	describe('SafetyIssueType', () => {
		it('型ガード: 有効な問題種別', () => {
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

			expect(validTypes).toHaveLength(10);
		});
	});

	describe('AuditAction', () => {
		it('型ガード: 有効なアクション種別', () => {
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

			expect(validActions).toHaveLength(9);
		});
	});
});
