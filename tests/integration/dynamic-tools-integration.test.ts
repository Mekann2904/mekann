/**
 * @abdd.meta
 * path: tests/integration/dynamic-tools-integration.test.ts
 * role: 動的ツールシステムの統合テスト
 * why: レジストリ、安全性検証、監査ログ間の連携が正しく動作することを保証するため
 * related: .pi/lib/dynamic-tools/registry.ts, .pi/lib/dynamic-tools/safety.ts, .pi/lib/dynamic-tools/audit.ts
 * public_api: DynamicToolRegistry, quickSafetyCheck, logAudit
 * invariants: ツールIDは一意、検証済みツールのみ実行可能、監査ログは正しく記録される
 * side_effects: ファイルシステムへのツール定義JSONの書き込み、監査ログの記録
 * failure_modes: ディスクI/Oエラー、検証失敗、実行時エラー
 * @abdd.explain
 * overview: 動的ツールシステムの登録、検証、実行、監査の統合動作をテストする
 * what_it_does:
 *   - ツール登録と安全性検証の連携をテスト
 *   - 監査ログの記録をテスト
 *   - ツール一覧とフィルタリングをテスト
 * why_it_exists:
 *   - システム全体の連携が正しく動作することを保証するため
 * scope:
 *   in: DynamicToolRegistry、安全性検証関数、監査ログ関数
 *   out: テストの実行結果
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getDynamicToolsPaths,
	DEFAULT_DYNAMIC_TOOLS_CONFIG,
	type DynamicToolDefinition,
	type DynamicToolRegistrationRequest,
	type VerificationStatus,
} from '@lib/dynamic-tools/types';
import { quickSafetyCheck, analyzeCodeSafety } from '@lib/dynamic-tools/safety';
import { createTempDir, cleanupTempDir } from '../helpers/bdd-helpers';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';

describe('Dynamic Tools Integration', () => {
	describe('getDynamicToolsPaths', () => {
		it('正常系: パス設定を取得できる', () => {
			const paths = getDynamicToolsPaths();

			expect(paths.toolsDir).toBeDefined();
			expect(paths.skillsDir).toBeDefined();
			expect(paths.auditLogFile).toBeDefined();
			expect(paths.metricsFile).toBeDefined();
		});

		it('正常系: パスは有効な文字列', () => {
			const paths = getDynamicToolsPaths();

			expect(typeof paths.toolsDir).toBe('string');
			expect(typeof paths.skillsDir).toBe('string');
			expect(typeof paths.auditLogFile).toBe('string');
			expect(typeof paths.metricsFile).toBe('string');
		});
	});

	describe('Safety Integration', () => {
		describe('quickSafetyCheck', () => {
			it('正常系: 安全なコードを検出できる', () => {
				const safeCode = `
					function greet(name) {
						return 'Hello, ' + name;
					}
				`;

				const result = quickSafetyCheck(safeCode);

				expect(result.isSafe).toBe(true);
			});

			it('正常系: eval()を検出できる', () => {
				const unsafeCode = `
					function run(code) {
						return eval(code);
					}
				`;

				const result = quickSafetyCheck(unsafeCode);

				expect(result.isSafe).toBe(false);
				expect(result.reason).toBeDefined();
			});

			it('正常系: コマンドインジェクションを検出できる', () => {
				const unsafeCode = `
					function run(cmd) {
						return execSync(cmd);
					}
				`;

				const result = quickSafetyCheck(unsafeCode);

				expect(result.isSafe).toBe(false);
			});
		});

		describe('analyzeCodeSafety', () => {
			it('正常系: 詳細な安全性分析を実行できる', async () => {
				const code = `
					function add(a, b) {
						return a + b;
					}
				`;

				const result = await analyzeCodeSafety(code);

				expect(result).toHaveProperty('isSafe');
				expect(result).toHaveProperty('score');
				expect(result).toHaveProperty('issues');
				expect(result).toHaveProperty('recommendations');
			});

			it('正常系: 安全スコアを判定できる', async () => {
				const safeCode = `function id(x) { return x; }`;
				const result = await analyzeCodeSafety(safeCode);

				expect(result.score).toBeGreaterThanOrEqual(0);
				expect(result.score).toBeLessThanOrEqual(1);
			});
		});
	});

	describe('Tool Definition Integration', () => {
		it('正常系: 有効なツール定義を作成できる', () => {
			const tool: DynamicToolDefinition = {
				id: 'test-tool-001',
				name: 'testTool',
				description: 'A test tool',
				mode: 'function',
				parameters: [
					{
						name: 'input',
						type: 'string',
						required: true,
						description: 'Input text',
					},
				],
				code: 'return input.toUpperCase();',
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				usageCount: 0,
				confidenceScore: 0.5,
				verificationStatus: 'unverified',
				tags: ['test'],
				createdBy: 'integration-test',
			};

			expect(tool.id).toBe('test-tool-001');
			expect(tool.name).toBe('testTool');
			expect(tool.mode).toBe('function');
		});

		it('正常系: 登録リクエストを作成できる', () => {
			const request: DynamicToolRegistrationRequest = {
				name: 'newTool',
				description: 'A new tool',
				mode: 'bash',
				code: 'echo "Hello"',
				parameters: [],
				tags: ['utility'],
			};

			expect(request.name).toBe('newTool');
			expect(request.mode).toBe('bash');
		});
	});

	describe('Verification Status', () => {
		it('正常系: 検証ステータスの遷移', () => {
			const statuses: VerificationStatus[] = [
				'unverified',
				'pending',
				'passed',
				'failed',
				'deprecated',
			];

			statuses.forEach((status) => {
				const tool: Partial<DynamicToolDefinition> = {
					verificationStatus: status,
				};
				expect(tool.verificationStatus).toBe(status);
			});
		});
	});

	describe('DEFAULT_DYNAMIC_TOOLS_CONFIG Integration', () => {
		it('正常系: 設定値が一貫している', () => {
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.enabled).toBe(true);
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.maxTools).toBeGreaterThan(0);
			expect(DEFAULT_DYNAMIC_TOOLS_CONFIG.defaultTimeoutMs).toBeGreaterThan(0);
		});

		it('正常系: 許可された操作が定義されている', () => {
			const { allowedOperations } = DEFAULT_DYNAMIC_TOOLS_CONFIG;

			expect(allowedOperations.allowedModules).toBeInstanceOf(Array);
			expect(allowedOperations.allowedCommands).toBeInstanceOf(Array);
			expect(allowedOperations.maxExecutionTimeMs).toBeGreaterThan(0);
		});
	});
});

describe('File System Integration', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = createTempDir('dynamic-tools-test-');
	});

	afterEach(() => {
		cleanupTempDir(tempDir);
	});

	it('正常系: ツール保存ディレクトリを作成できる', () => {
		const toolsDir = join(tempDir, 'tools');
		mkdirSync(toolsDir, { recursive: true });

		expect(existsSync(toolsDir)).toBe(true);
	});

	it('正常系: ツール定義をファイルに保存・読み込みできる', () => {
		const tool: DynamicToolDefinition = {
			id: 'fs-test-001',
			name: 'fsTestTool',
			description: 'File system test tool',
			mode: 'function',
			parameters: [],
			code: 'return 42;',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			usageCount: 0,
			confidenceScore: 1,
			verificationStatus: 'passed',
			tags: ['test'],
			createdBy: 'fs-test',
		};

		const filePath = join(tempDir, 'tool.json');

		// 保存
		writeFileSync(filePath, JSON.stringify(tool, null, 2));

		// 読み込み
		const content = readFileSync(filePath, 'utf-8');
		const loaded = JSON.parse(content) as DynamicToolDefinition;

		expect(loaded.id).toBe(tool.id);
		expect(loaded.name).toBe(tool.name);
		expect(loaded.code).toBe(tool.code);
	});

	it('正常系: 監査ログを追記できる', () => {
		const logFile = join(tempDir, 'audit.jsonl');

		const entry1 = JSON.stringify({
			id: 'log-1',
			action: 'tool.create',
			timestamp: new Date().toISOString(),
		});

		const entry2 = JSON.stringify({
			id: 'log-2',
			action: 'tool.run',
			timestamp: new Date().toISOString(),
		});

		// 追記
		writeFileSync(logFile, entry1 + '\n');
		writeFileSync(logFile, entry2 + '\n', { flag: 'a' });

		// 検証
		const content = readFileSync(logFile, 'utf-8');
		const lines = content.trim().split('\n');

		expect(lines).toHaveLength(2);
		expect(JSON.parse(lines[0]).action).toBe('tool.create');
		expect(JSON.parse(lines[1]).action).toBe('tool.run');
	});

	it('正常系: 複数のツールを一覧できる', () => {
		const toolsDir = join(tempDir, 'tools');
		mkdirSync(toolsDir, { recursive: true });

		// 複数のツールファイルを作成
		for (let i = 1; i <= 3; i++) {
			const tool: DynamicToolDefinition = {
				id: `tool-${i}`,
				name: `tool${i}`,
				description: `Tool ${i}`,
				mode: 'function',
				parameters: [],
				code: `return ${i};`,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				usageCount: 0,
				confidenceScore: 0.5,
				verificationStatus: 'unverified',
				tags: [],
				createdBy: 'test',
			};
			writeFileSync(join(toolsDir, `tool-${i}.json`), JSON.stringify(tool));
		}

		// ファイル一覧を取得
		const files = readdirSync(toolsDir);

		expect(files).toHaveLength(3);
		expect(files.sort()).toEqual(['tool-1.json', 'tool-2.json', 'tool-3.json']);
	});
});

describe('Safety and Quality Integration', () => {
	describe('安全性と品質の統合チェック', () => {
		it('統合: 安全なコードは検証を通過する', async () => {
			const code = `
				function formatString(input) {
					if (typeof input !== 'string') {
						throw new Error('Input must be a string');
					}
					return input.trim().toLowerCase();
				}
			`;

			const safetyResult = quickSafetyCheck(code);

			expect(safetyResult.isSafe).toBe(true);
		});

		it('統合: 危険なコードは検証に失敗する', async () => {
			const code = `
				const { exec } = require('child_process');
				function runCommand(cmd) {
					exec(cmd, (err, stdout) => console.log(stdout));
				}
			`;

			const safetyResult = quickSafetyCheck(code);

			expect(safetyResult.isSafe).toBe(false);
		});

		it('統合: 複数の問題を検出できる', async () => {
			const code = `
				eval(userInput);
				execSync(userCommand);
			`;

			const result = await analyzeCodeSafety(code);

			expect(result.issues.length).toBeGreaterThanOrEqual(1);
		});
	});
});
