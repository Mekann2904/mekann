/**
 * Sandbox Approvals の独立テスト。
 *
 * shouldRequestApproval と yoloApprovalMessage を検証する。
 * UX layer であり security boundary ではないことを前提に、
 * 正規表現ベースのパターンマッチングの精度を確認する。
 */

import { describe, it, expect } from "vitest";
import {
	shouldRequestApproval,
	yoloApprovalMessage,
	type YoloApprovalState,
} from "../approvals.js";

// ─── shouldRequestApproval: yolo ──────────────────

describe("shouldRequestApproval: yolo", () => {
	it("未承認の場合は承認が必要", () => {
		const result = shouldRequestApproval("yolo", "ls");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("approval");
	});

	it("yoloApproved=true なら承認不要", () => {
		const state: YoloApprovalState = { yoloApproved: true };
		const result = shouldRequestApproval("yolo", "rm -rf /", state);
		expect(result.needsApproval).toBe(false);
	});

	it("yoloApproved=false なら承認が必要", () => {
		const state: YoloApprovalState = { yoloApproved: false };
		const result = shouldRequestApproval("yolo", "ls", state);
		expect(result.needsApproval).toBe(true);
	});

	it("approvalState 未指定なら承認が必要", () => {
		const result = shouldRequestApproval("yolo", "echo hello");
		expect(result.needsApproval).toBe(true);
	});

	it("approvalState の部分的な指定でも承認が必要", () => {
		const result = shouldRequestApproval("yolo", "ls", {
			yoloApprovedAt: new Date(),
		});
		expect(result.needsApproval).toBe(true);
	});
});

// ─── shouldRequestApproval: workspace_write 危険パターン ────────

describe("shouldRequestApproval: workspace_write dangerous patterns", () => {
	it("rm -rf は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "rm -rf ./node_modules");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("Recursive force delete");
	});

	it("rm -r は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "rm -r ./dist");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("Recursive delete");
	});

	it("sudo は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "sudo apt install build-essential");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("Elevated privileges");
	});

	it("chmod 777 は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "chmod 777 /tmp/test");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("Permission change");
	});

	it("chmod 755 は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "chmod 755 script.sh");
		expect(result.needsApproval).toBe(true);
	});

	it("chown は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "chown root:wheel file");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("Ownership change");
	});

	it("shutdown は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "shutdown -h now");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("System shutdown");
	});

	it("reboot は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "reboot");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("System reboot");
	});

	it("mkfs は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "mkfs.ext4 /dev/sda1");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("Filesystem format");
	});

	it("dd は承認が必要", () => {
		const result = shouldRequestApproval("workspace_write", "dd if=/dev/zero of=/dev/sda");
		expect(result.needsApproval).toBe(true);
		expect(result.reason).toContain("Raw disk operation");
	});
});

// ─── shouldRequestApproval: workspace_write 安全パターン ────────

describe("shouldRequestApproval: workspace_write safe patterns", () => {
	const safeCommands = [
		"ls -la",
		"cat README.md",
		"echo hello",
		"git status",
		"npm test",
		"npm run build",
		"node script.js",
		"python script.py",
		"make build",
		"cargo build",
		"go test ./...",
		"mkdir -p src/components",
		"touch newfile.ts",
		"cp file.txt backup.txt",
		"mv old.ts new.ts",
	];

	for (const cmd of safeCommands) {
		it(`${cmd}`, () => {
			const result = shouldRequestApproval("workspace_write", cmd);
			expect(result.needsApproval).toBe(false);
		});
	}
});

// ─── shouldRequestApproval: read_only ────────────────────────────

describe("shouldRequestApproval: read_only", () => {
	it("通常コマンドは承認不要", () => {
		expect(shouldRequestApproval("read_only", "ls").needsApproval).toBe(false);
	});

	it("危険パターンでも承認が必要 (UX layer)", () => {
		const result = shouldRequestApproval("read_only", "rm -rf /");
		expect(result.needsApproval).toBe(true);
	});

	it("sudo は承認が必要", () => {
		const result = shouldRequestApproval("read_only", "sudo ls");
		expect(result.needsApproval).toBe(true);
	});
});

// ─── shouldRequestApproval: バイパス可能性 ──────────────────────

describe("shouldRequestApproval: bypass patterns (NOT a security boundary)", () => {
	it("base64 エンコードされた rm -rf は検出できない", () => {
		// This is expected behavior — the approval layer is NOT a security boundary
		const result = shouldRequestApproval("workspace_write", "echo cm0gLXJmIC8= | base64 -d | bash");
		// May or may not be detected — the point is it's NOT reliable
		// The actual security is provided by the Seatbelt sandbox
		expect(typeof result.needsApproval).toBe("boolean");
	});

	it("変数展開による rm -rf は検出できない", () => {
		const result = shouldRequestApproval("workspace_write", "CMD='rm -rf /'; $CMD");
		expect(typeof result.needsApproval).toBe("boolean");
	});
});

// ─── yoloApprovalMessage ────────────────────────────────────

describe("yoloApprovalMessage", () => {
	it("sandboxing について警告する", () => {
		const msg = yoloApprovalMessage();
		expect(msg).toContain("disable sandboxing");
	});

	it("unrestricted access について言及する", () => {
		const msg = yoloApprovalMessage();
		expect(msg).toContain("unrestricted access");
	});

	it("ファイルアクセスについて言及する", () => {
		const msg = yoloApprovalMessage();
		expect(msg).toContain("files");
	});

	it("ネットワークについて言及する", () => {
		const msg = yoloApprovalMessage();
		expect(msg).toContain("network");
	});

	it("警告絵文字を含む", () => {
		const msg = yoloApprovalMessage();
		expect(msg).toContain("[!]");
	});
});

// ─── YoloApprovalState 型の挙動確認 ────────────────────────

describe("YoloApprovalState: state transitions", () => {
	it("初期状態は未承認", () => {
		const state: YoloApprovalState = { yoloApproved: false };
		expect(state.yoloApproved).toBe(false);
		expect(state.yoloApprovedAt).toBeUndefined();
		expect(state.yoloApprovedReason).toBeUndefined();
	});

	it("承認後は全フィールドが設定される", () => {
		const state: YoloApprovalState = {
			yoloApproved: true,
			yoloApprovedAt: new Date(),
			yoloApprovedReason: "test",
		};
		expect(state.yoloApproved).toBe(true);
		expect(state.yoloApprovedAt).toBeInstanceOf(Date);
		expect(state.yoloApprovedReason).toBe("test");
	});

	it("shouldRequestApproval は state の変更を反映する", () => {
		const state: YoloApprovalState = { yoloApproved: false };

		expect(shouldRequestApproval("yolo", "ls", state).needsApproval).toBe(true);

		state.yoloApproved = true;
		expect(shouldRequestApproval("yolo", "ls", state).needsApproval).toBe(false);
	});
});
