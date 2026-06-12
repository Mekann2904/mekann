import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import type { SandboxMode, SandboxPolicy } from "./permissions.js";
import { shouldRequestApproval } from "./permissions.js";
import { modeLabel } from "../policy-core/modes.js";
import { runSandboxedShellMac } from "./macSeatbelt.js";
import { formatSandboxedBashOutputForLlm } from "./output.js";

export const SANDBOX_BLOCK_HINT = " このコマンドの実行が必要な場合は、request_elevation ツールを使ってユーザーに許可を求めてください。";

export type SandboxExecutionControlDeps = {
	isExplicitlyDisabled(): boolean;
	startupBlockedReason(): string | undefined;
	isSandboxAvailable(): boolean;
	effectiveMode(): SandboxMode;
	buildCurrentPolicy(): SandboxPolicy;
	cwd(): string;
	confirm(title: string, message: string): Promise<boolean>;
	runUnsandboxed(id: string, params: unknown, signal: AbortSignal | undefined, onUpdate: unknown): Promise<AgentToolResult<unknown>>;
};

export class SandboxExecutionControl {
	constructor(private readonly deps: SandboxExecutionControlDeps) {}

	async executeBash(id: string, params: { command?: unknown }, signal?: AbortSignal, onUpdate?: unknown): Promise<AgentToolResult<unknown>> {
		const command = String(params.command ?? "");
		if (this.deps.isExplicitlyDisabled()) return this.deps.runUnsandboxed(id, params, signal, onUpdate);
		const blocked = this.deps.startupBlockedReason();
		if (blocked) throw new Error(`${blocked}${SANDBOX_BLOCK_HINT}`);
		if (this.deps.effectiveMode() === "yolo") return this.deps.runUnsandboxed(id, params, signal, onUpdate);
		if (!this.deps.isSandboxAvailable()) throw new Error("サンドボックスが必要ですが /usr/bin/sandbox-exec が利用できません。サンドボックス強制なしではコマンドを実行できません。--no-sandbox で明示的に無効化してください（非推奨）。" + SANDBOX_BLOCK_HINT);

		const mode = this.deps.effectiveMode();
		const approval = shouldRequestApproval(mode, command);
		if (approval.needsApproval && approval.reason) {
			const ok = await this.deps.confirm("[!] コマンドの承認が必要です", `サンドボックスモード: ${modeLabel(mode)}\nコマンド: ${command}\n理由: ${approval.reason}\n\nこのコマンドを許可しますか？`);
			if (!ok) throw new Error(`コマンドがブロックされました: ${approval.reason}`);
		}

		const result = await runSandboxedShellMac(command, this.deps.buildCurrentPolicy(), { signal });
		const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
		const { shown, outputGate } = await formatSandboxedBashOutputForLlm({ cwd: this.deps.cwd(), command, output });
		if (result.code !== 0) {
			const isPermissionError = /Operation not permitted|Permission denied|EPERM|EACCES/.test(shown.text);
			const hint = isPermissionError ? SANDBOX_BLOCK_HINT : "";
			throw new Error(`サンドボックスコマンドが終了コード ${result.code} で終了しました${shown.text ? `:\n${shown.text}` : ""}${hint}`);
		}
		return {
			content: [{ type: "text", text: shown.text || "(出力なし)" }],
			details: { sandboxed: true, mode, exitCode: result.code, outputTruncated: shown.truncated, originalOutputBytes: shown.originalBytes, originalOutputLines: shown.originalLines, ...(outputGate ? { outputGate } : {}) },
		};
	}
}
