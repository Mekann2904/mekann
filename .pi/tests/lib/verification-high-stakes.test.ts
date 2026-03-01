/**
 * @file .pi/lib/verification-high-stakes.ts の単体テスト
 * @description 高リスクタスク判定ユーティリティのテスト
 * @testFramework vitest + fast-check
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// モジュールをインポート
import {
	isHighStakesTask,
	HIGH_STAKES_PATTERNS,
} from "../../lib/verification-high-stakes.js";

// ============================================================================
// isHighStakesTask
// ============================================================================

describe("isHighStakesTask", () => {
	describe("削除・破壊的操作", () => {
		it("should_detect_delete_keyword", () => {
			expect(isHighStakesTask("Delete the file")).toBe(true);
			expect(isHighStakesTask("ファイルを削除")).toBe(true);
		});

		it("should_detect_destructive_keyword", () => {
			expect(isHighStakesTask("Destructive operation")).toBe(true);
			expect(isHighStakesTask("破壊的変更")).toBe(true);
		});

		it("should_detect_remove_keyword", () => {
			expect(isHighStakesTask("Remove the directory")).toBe(true);
		});

		it("should_detect_drop_keyword", () => {
			expect(isHighStakesTask("Drop the table")).toBe(true);
		});

		it("should_detect_truncate_keyword", () => {
			expect(isHighStakesTask("Truncate the log")).toBe(true);
		});

		it("should_detect_wipe_keyword", () => {
			expect(isHighStakesTask("Wipe the database")).toBe(true);
		});

		it("should_detect_purge_with_spaces", () => {
			expect(isHighStakesTask("Run purge command")).toBe(true);
		});

		it("should_not_detect_purge_without_spaces", () => {
			// purge単体はスペースが必要
			expect(isHighStakesTask("purge")).toBe(false);
		});
	});

	describe("本番環境・リリース", () => {
		it("should_detect_production_keyword", () => {
			expect(isHighStakesTask("Deploy to production")).toBe(true);
			expect(isHighStakesTask("本番環境にデプロイ")).toBe(true);
		});

		it("should_detect_prod_abbreviation", () => {
			expect(isHighStakesTask("Deploy to prod")).toBe(true);
		});

		it("should_detect_release_keyword", () => {
			expect(isHighStakesTask("Release version 2.0")).toBe(true);
			expect(isHighStakesTask("リリース準備")).toBe(true);
		});

		it("should_detect_live_environment", () => {
			expect(isHighStakesTask("Push to live environment")).toBe(true);
		});
	});

	describe("セキュリティ・認証", () => {
		it("should_detect_security_keyword", () => {
			expect(isHighStakesTask("Fix security vulnerability")).toBe(true);
			expect(isHighStakesTask("セキュリティ修正")).toBe(true);
		});

		it("should_detect_authentication_keyword", () => {
			expect(isHighStakesTask("Update authentication system")).toBe(true);
			expect(isHighStakesTask("認証方法を変更")).toBe(true);
		});

		it("should_detect_password_keyword", () => {
			expect(isHighStakesTask("Change password")).toBe(true);
			expect(isHighStakesTask("パスワード更新")).toBe(true);
		});

		it("should_detect_api_key_keyword", () => {
			expect(isHighStakesTask("Rotate API key")).toBe(true);
		});

		it("should_detect_token_keyword", () => {
			expect(isHighStakesTask("Refresh the token")).toBe(true);
		});

		it("should_detect_vulnerability_keyword", () => {
			expect(isHighStakesTask("Fix XSS vulnerability")).toBe(true);
			expect(isHighStakesTask("脆弱性対応")).toBe(true);
		});

		it("should_detect_injection_keyword", () => {
			expect(isHighStakesTask("Prevent SQL injection")).toBe(true);
		});

		it("should_detect_xss_keyword", () => {
			expect(isHighStakesTask("Fix XSS issue")).toBe(true);
		});

		it("should_detect_csrf_keyword", () => {
			expect(isHighStakesTask("Add CSRF protection")).toBe(true);
		});
	});

	describe("データベース操作", () => {
		it("should_detect_migration_keyword", () => {
			expect(isHighStakesTask("Run database migration")).toBe(true);
			expect(isHighStakesTask("マイグレーション実行")).toBe(true);
		});

		it("should_detect_schema_keyword", () => {
			expect(isHighStakesTask("Modify schema")).toBe(true);
			expect(isHighStakesTask("スキーマ変更")).toBe(true);
		});

		it("should_detect_alter_keyword", () => {
			expect(isHighStakesTask("ALTER TABLE users")).toBe(true);
		});

		it("should_detect_grant_keyword", () => {
			expect(isHighStakesTask("GRANT SELECT ON table")).toBe(true);
		});

		it("should_detect_rollback_keyword", () => {
			expect(isHighStakesTask("Rollback the migration")).toBe(true);
		});

		it("should_detect_backup_keyword", () => {
			expect(isHighStakesTask("Create backup")).toBe(true);
		});
	});

	describe("API契約変更", () => {
		it("should_detect_breaking_change_keyword", () => {
			expect(isHighStakesTask("Breaking change in API")).toBe(true);
			expect(isHighStakesTask("破壊的変更を含む")).toBe(true);
		});

		it("should_detect_deprecated_keyword", () => {
			expect(isHighStakesTask("Mark as deprecated")).toBe(true);
			expect(isHighStakesTask("廃止予定")).toBe(true);
		});

		it("should_detect_api_contract_keyword", () => {
			expect(isHighStakesTask("Modify API contract")).toBe(true);
		});
	});

	describe("認可・アクセス制御", () => {
		it("should_detect_permission_keyword", () => {
			expect(isHighStakesTask("Change permission")).toBe(true);
			expect(isHighStakesTask("権限設定")).toBe(true);
		});

		it("should_detect_authorize_keyword", () => {
			expect(isHighStakesTask("Authorize the user")).toBe(true);
		});

		it("should_detect_acl_keyword", () => {
			expect(isHighStakesTask("Update ACL rules")).toBe(true);
		});
	});

	describe("インフラ・デプロイ", () => {
		it("should_detect_deploy_keyword", () => {
			expect(isHighStakesTask("Deploy to server")).toBe(true);
			expect(isHighStakesTask("デプロイ実施")).toBe(true);
		});

		it("should_detect_kubernetes_keyword", () => {
			expect(isHighStakesTask("Update kubernetes config")).toBe(true);
			expect(isHighStakesTask("Apply k8s manifest")).toBe(true);
		});

		it("should_detect_terraform_keyword", () => {
			expect(isHighStakesTask("Run terraform apply")).toBe(true);
		});

		it("should_detect_scale_keyword", () => {
			expect(isHighStakesTask("Scale up the cluster")).toBe(true);
			expect(isHighStakesTask("Scale down replicas")).toBe(true);
		});
	});

	describe("機密データ・コスト", () => {
		it("should_detect_pii_keyword", () => {
			expect(isHighStakesTask("Process PII data")).toBe(true);
		});

		it("should_detect_personal_data_keyword", () => {
			expect(isHighStakesTask("Handle personal data")).toBe(true);
			expect(isHighStakesTask("個人情報を処理")).toBe(true);
		});

		it("should_detect_confidential_keyword", () => {
			expect(isHighStakesTask("Access confidential files")).toBe(true);
			expect(isHighStakesTask("機密情報")).toBe(true);
		});

		it("should_detect_cost_keyword", () => {
			expect(isHighStakesTask("Optimize cost")).toBe(true);
			expect(isHighStakesTask("コスト削減")).toBe(true);
		});

		it("should_detect_billing_keyword", () => {
			expect(isHighStakesTask("Update billing info")).toBe(true);
			expect(isHighStakesTask("課金設定")).toBe(true);
		});
	});

	describe("不可逆操作・危険フラグ", () => {
		it("should_detect_force_keyword", () => {
			expect(isHighStakesTask("Force delete")).toBe(true);
			expect(isHighStakesTask("強制終了")).toBe(true);
		});

		it("should_detect_permanent_keyword", () => {
			expect(isHighStakesTask("Permanent deletion")).toBe(true);
			expect(isHighStakesTask("永続的変更")).toBe(true);
		});

		it("should_detect_irreversible_keyword", () => {
			expect(isHighStakesTask("Irreversible operation")).toBe(true);
			expect(isHighStakesTask("不可逆操作")).toBe(true);
		});

		it("should_detect_bypass_keyword", () => {
			expect(isHighStakesTask("Bypass security")).toBe(true);
		});

		it("should_detect_overwrite_keyword", () => {
			expect(isHighStakesTask("Overwrite the file")).toBe(true);
			expect(isHighStakesTask("上書き保存")).toBe(true);
		});
	});

	describe("低リスクタスク", () => {
		it("should_return_false_for_safe_tasks", () => {
			expect(isHighStakesTask("Add a comment")).toBe(false);
			expect(isHighStakesTask("Fix typo in README")).toBe(false);
			expect(isHighStakesTask("Update documentation")).toBe(false);
			expect(isHighStakesTask("Add unit tests")).toBe(false);
			expect(isHighStakesTask("Refactor code")).toBe(false);
		});

		it("should_return_false_for_empty_string", () => {
			expect(isHighStakesTask("")).toBe(false);
		});

		it("should_return_false_for_whitespace_only", () => {
			expect(isHighStakesTask("   ")).toBe(false);
		});
	});

	describe("大文字小文字", () => {
		it("should_be_case_insensitive", () => {
			expect(isHighStakesTask("DELETE the file")).toBe(true);
			expect(isHighStakesTask("delete the file")).toBe(true);
			expect(isHighStakesTask("Delete The File")).toBe(true);
		});
	});

	describe("複合パターン", () => {
		it("should_detect_multiple_risks", () => {
			expect(isHighStakesTask("Force delete production database")).toBe(true);
			expect(isHighStakesTask("Deploy security fix to prod")).toBe(true);
		});
	});
});

// ============================================================================
// HIGH_STAKES_PATTERNS
// ============================================================================

describe("HIGH_STAKES_PATTERNS", () => {
	it("should_be_array_of_regex", () => {
		expect(Array.isArray(HIGH_STAKES_PATTERNS)).toBe(true);
		expect(HIGH_STAKES_PATTERNS.length).toBeGreaterThan(0);

		for (const pattern of HIGH_STAKES_PATTERNS) {
			expect(pattern).toBeInstanceOf(RegExp);
		}
	});

	it("should_cover_all_categories", () => {
		const patternStrings = HIGH_STAKES_PATTERNS.map(p => p.source);

		// 削除系
		expect(patternStrings.some(p => p.includes("delete"))).toBe(true);
		// 本番系
		expect(patternStrings.some(p => p.includes("production"))).toBe(true);
		// セキュリティ系
		expect(patternStrings.some(p => p.includes("security"))).toBe(true);
		// データベース系
		expect(patternStrings.some(p => p.includes("migration"))).toBe(true);
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
	it("should_always_return_boolean", () => {
		fc.assert(
			fc.property(fc.string(), (task) => {
				const result = isHighStakesTask(task);
				expect(typeof result).toBe("boolean");
				return true;
			})
		);
	});

	it("should_be_deterministic", () => {
		fc.assert(
			fc.property(fc.string(), (task) => {
				const result1 = isHighStakesTask(task);
				const result2 = isHighStakesTask(task);
				expect(result1).toBe(result2);
				return true;
			})
		);
	});

	it("should_detect_known_patterns", () => {
		const knownHighStakes = [
			"delete the file",
			"deploy to production",
			"fix security issue",
			"run migration",
			"grant permissions",
		];

		for (const task of knownHighStakes) {
			expect(isHighStakesTask(task)).toBe(true);
		}
	});
});
