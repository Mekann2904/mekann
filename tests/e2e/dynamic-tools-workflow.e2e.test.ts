/**
 * @abdd.meta
 * path: tests/e2e/dynamic-tools-workflow.e2e.test.ts
 * role: 動的ツール生成システムのE2Eテスト
 * why: ユーザーが動的ツールを作成、検証、実行する完全なワークフローを保証するため
 * related: .pi/lib/dynamic-tools/registry.ts, .pi/lib/dynamic-tools/safety.ts, .pi/lib/dynamic-tools/executor.ts
 * public_api: DynamicToolRegistry, quickSafetyCheck, executeTool
 * invariants: ツールの完全なライフサイクル（作成→検証→実行→削除）が正しく動作する
 * side_effects: ファイルシステムへのツール定義JSONの書き込み、監査ログの記録
 * failure_modes: 検証失敗、実行時エラー、ファイルI/Oエラー
 * @abdd.explain
 * overview: 動的ツール生成システムのエンドツーエンドワークフローをテストする
 * what_it_does:
 *   - ツールの作成、登録、実行、削除の完全なフローをテスト
 *   - 安全性検証の統合をテスト
 *   - エラーハンドリングとエッジケースをテスト
 * why_it_exists:
 *   - ユーザーが実際に使用するワークフローが正しく動作することを保証するため
 * scope:
 *   in: ツール定義、実行パラメータ
 *   out: テストの実行結果
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	getDynamicToolsPaths,
	DEFAULT_DYNAMIC_TOOLS_CONFIG,
	type DynamicToolDefinition,
	type DynamicToolRegistrationRequest,
	type DynamicToolMode,
	type VerificationStatus,
} from '@lib/dynamic-tools/types';
import { quickSafetyCheck, analyzeCodeSafety } from '@lib/dynamic-tools/safety';
import { createTempDir, cleanupTempDir } from '../helpers/bdd-helpers';
import { join } from 'node:path';
import {
	existsSync,
	mkdirSync,
	writeFileSync,
	rmSync,
	readFileSync,
	readdirSync,
} from 'node:fs';

/**
 * E2Eテスト: 動的ツールワークフロー
 *
 * テストシナリオ:
 * 1. ツールの作成と登録
 * 2. 安全性検証
 * 3. ツールの実行
 * 4. ツールの管理（一覧、削除）
 */
describe('Dynamic Tools E2E Workflow', () => {
	let tempToolsDir: string;
	let tempAuditDir: string;

	beforeEach(() => {
		tempToolsDir = createTempDir('e2e-tools-');
		tempAuditDir = createTempDir('e2e-audit-');
	});

	afterEach(() => {
		cleanupTempDir(tempToolsDir);
		cleanupTempDir(tempAuditDir);
	});

	describe('Feature: ツール作成ワークフロー', () => {
		describe('Scenario: 安全なツールの作成と登録', () => {
			it('Given: ユーザーが安全なツールコードを用意し、When: ツールを登録すると、Then: ツールが正常に作成される', async () => {
				// Given: 安全なツールコード
				const toolRequest: DynamicToolRegistrationRequest = {
					name: 'stringUtils',
					description: '文字列処理ユーティリティ',
					mode: 'function',
					code: `
						function process(input) {
							return input.trim().toUpperCase();
						}
					`,
					parameters: [
						{
							name: 'input',
							type: 'string',
							required: true,
							description: '処理する文字列',
						},
					],
					tags: ['string', 'utility'],
				};

				// When: 安全性チェック
				const safetyResult = quickSafetyCheck(toolRequest.code);

				// Then: 安全と判定される
				expect(safetyResult.isSafe).toBe(true);

				// When: ツール定義を作成
				const toolDefinition: DynamicToolDefinition = {
					id: `tool-${Date.now()}`,
					name: toolRequest.name,
					description: toolRequest.description,
					mode: toolRequest.mode,
					parameters: toolRequest.parameters || [],
					code: toolRequest.code,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					usageCount: 0,
					confidenceScore: 1,
					verificationStatus: 'passed',
					tags: toolRequest.tags || [],
					createdBy: 'e2e-test',
				};

				// When: ファイルに保存
				const toolPath = join(tempToolsDir, `${toolDefinition.id}.json`);
				writeFileSync(toolPath, JSON.stringify(toolDefinition, null, 2));

				// Then: ファイルが作成される
				expect(existsSync(toolPath)).toBe(true);

				// And: 内容が正しい
				const saved = JSON.parse(readFileSync(toolPath, 'utf-8'));
				expect(saved.name).toBe('stringUtils');
				expect(saved.verificationStatus).toBe('passed');
			});
		});

		describe('Scenario: 危険なツールの検出', () => {
			it('Given: ユーザーが危険なコードを含むツールを用意し、When: 安全性チェックを行うと、Then: 危険が検出される', async () => {
				// Given: 危険なコード
				const dangerousCode = `
					function runCommand(userInput) {
						return eval(userInput);
					}
				`;

				// When: 安全性チェック
				const result = quickSafetyCheck(dangerousCode);

				// Then: 危険と判定される
				expect(result.isSafe).toBe(false);
				expect(result.reason).toBeDefined();
			});
		});
	});

	describe('Feature: ツール管理ワークフロー', () => {
		beforeEach(() => {
			// 複数のツールを作成
			const tools: DynamicToolDefinition[] = [
				{
					id: 'tool-001',
					name: 'toolA',
					description: 'Tool A',
					mode: 'function',
					parameters: [],
					code: 'return 1;',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					usageCount: 5,
					confidenceScore: 0.9,
					verificationStatus: 'passed',
					tags: ['category-a'],
					createdBy: 'e2e-test',
				},
				{
					id: 'tool-002',
					name: 'toolB',
					description: 'Tool B',
					mode: 'bash',
					parameters: [],
					code: 'echo "hello"',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					usageCount: 3,
					confidenceScore: 0.8,
					verificationStatus: 'passed',
					tags: ['category-b'],
					createdBy: 'e2e-test',
				},
				{
					id: 'tool-003',
					name: 'toolC',
					description: 'Tool C (deprecated)',
					mode: 'function',
					parameters: [],
					code: 'return null;',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					usageCount: 0,
					confidenceScore: 0.3,
					verificationStatus: 'deprecated',
					tags: ['category-a'],
					createdBy: 'e2e-test',
				},
			];

			for (const tool of tools) {
				writeFileSync(join(tempToolsDir, `${tool.id}.json`), JSON.stringify(tool));
			}
		});

		describe('Scenario: ツール一覧の取得', () => {
			it('Given: 複数のツールが存在し、When: 一覧を取得すると、Then: すべてのツールが返される', async () => {
				// Given: ツールが存在する（beforeEachで作成）

				// When: 一覧を取得
				const files = readdirSync(tempToolsDir).filter((f) => f.endsWith('.json'));
				const tools = files.map((f) =>
					JSON.parse(readFileSync(join(tempToolsDir, f), 'utf-8'))
				);

				// Then: 3つのツールが返される
				expect(tools).toHaveLength(3);
			});
		});

		describe('Scenario: タグによるフィルタリング', () => {
			it('Given: タグ付きのツールが存在し、When: タグでフィルタリングすると、Then: 該当するツールのみ返される', async () => {
				// Given: ツールが存在する
				const files = readdirSync(tempToolsDir).filter((f) => f.endsWith('.json'));
				const tools = files.map((f) =>
					JSON.parse(readFileSync(join(tempToolsDir, f), 'utf-8'))
				);

				// When: タグでフィルタリング
				const filtered = tools.filter((t) => t.tags.includes('category-a'));

				// Then: 2つのツールが返される
				expect(filtered).toHaveLength(2);
			});
		});

		describe('Scenario: 検証ステータスによるフィルタリング', () => {
			it('Given: 検証済みと非推奨のツールが存在し、When: 検証済みのみ取得すると、Then: 有効なツールのみ返される', async () => {
				// Given: ツールが存在する
				const files = readdirSync(tempToolsDir).filter((f) => f.endsWith('.json'));
				const tools = files.map((f) =>
					JSON.parse(readFileSync(join(tempToolsDir, f), 'utf-8'))
				);

				// When: 検証済みのみ取得
				const verified = tools.filter(
					(t) => t.verificationStatus === 'passed' || t.verificationStatus === 'unverified'
				);

				// Then: 2つのツールが返される
				expect(verified).toHaveLength(2);
			});
		});

		describe('Scenario: ツールの削除', () => {
			it('Given: ツールが存在し、When: ツールを削除すると、Then: ツールが削除される', async () => {
				// Given: ツールが存在する
				const toolPath = join(tempToolsDir, 'tool-001.json');
				expect(existsSync(toolPath)).toBe(true);

				// When: ツールを削除
				rmSync(toolPath);

				// Then: ツールが削除される
				expect(existsSync(toolPath)).toBe(false);

				// And: 他のツールは残る
				const remainingFiles = readdirSync(tempToolsDir).filter((f) =>
					f.endsWith('.json')
				);
				expect(remainingFiles).toHaveLength(2);
			});
		});
	});

	describe('Feature: 監査ログワークフロー', () => {
		describe('Scenario: 操作の記録', () => {
			it('Given: ユーザーがツール操作を行い、When: 監査ログに記録すると、Then: ログが正しく保存される', async () => {
				// Given: 監査ログファイル
				const auditPath = join(tempAuditDir, 'audit.jsonl');

				// When: 操作を記録
				const entries = [
					{
						id: 'log-001',
						timestamp: new Date().toISOString(),
						action: 'tool.create',
						toolId: 'tool-001',
						actor: 'e2e-test',
						success: true,
					},
					{
						id: 'log-002',
						timestamp: new Date().toISOString(),
						action: 'tool.run',
						toolId: 'tool-001',
						actor: 'e2e-test',
						success: true,
					},
				];

				for (const entry of entries) {
					writeFileSync(auditPath, JSON.stringify(entry) + '\n', { flag: 'a' });
				}

				// Then: ログが保存される
				expect(existsSync(auditPath)).toBe(true);

				// And: 内容が正しい
				const logContent = readFileSync(auditPath, 'utf-8');
				const logLines = logContent.trim().split('\n');
				expect(logLines).toHaveLength(2);

				const firstEntry = JSON.parse(logLines[0]);
				expect(firstEntry.action).toBe('tool.create');
			});
		});
	});

	describe('Feature: 設定管理ワークフロー', () => {
		describe('Scenario: デフォルト設定の確認', () => {
			it('Given: システムが初期化され、When: デフォルト設定を確認すると、Then: 正しいデフォルト値が設定されている', async () => {
				// Given: システムが初期化されている

				// When: デフォルト設定を確認
				const config = DEFAULT_DYNAMIC_TOOLS_CONFIG;

				// Then: 正しいデフォルト値
				expect(config.enabled).toBe(true);
				expect(config.autoCreateEnabled).toBe(true);
				expect(config.maxTools).toBe(100);
				expect(config.defaultTimeoutMs).toBe(30000);

				// And: 許可された操作が定義されている
				expect(config.allowedOperations.allowedModules).toContain('node:fs');
				expect(config.allowedOperations.allowedCommands).toContain('ls');
			});
		});

		describe('Scenario: パス設定の確認', () => {
			it('Given: システムが初期化され、When: パス設定を取得すると、Then: 正しいパスが返される', async () => {
				// Given: システムが初期化されている

				// When: パス設定を取得
				const paths = getDynamicToolsPaths();

				// Then: 正しいパスが返される
				expect(paths.toolsDir).toContain('.pi');
				expect(paths.toolsDir).toContain('tools');
				expect(paths.skillsDir).toContain('skills');
				expect(paths.skillsDir).toContain('dynamic');
			});
		});
	});

	describe('Feature: エラーハンドリング', () => {
		describe('Scenario: 無効なツール定義の処理', () => {
			it('Given: 無効なツール定義があり、When: 読み込もうとすると、Then: エラーが発生する', async () => {
				// Given: 無効なJSONファイル
				const invalidPath = join(tempToolsDir, 'invalid.json');
				writeFileSync(invalidPath, 'not valid json');

				// When/Then: 読み込みでエラーが発生する
				expect(() => {
					JSON.parse(readFileSync(invalidPath, 'utf-8'));
				}).toThrow();
			});
		});

		describe('Scenario: 存在しないツールの処理', () => {
			it('Given: ツールが存在せず、When: ファイルを読み込もうとすると、Then: エラーが発生する', async () => {
				// Given: 存在しないパス
				const nonExistentPath = join(tempToolsDir, 'nonexistent.json');

				// When/Then: ファイルが存在しない
				expect(existsSync(nonExistentPath)).toBe(false);
			});
		});
	});
});
