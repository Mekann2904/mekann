/**
 * @abdd.meta
 * @path .pi/extensions/ghost-buster.ts
 * @role piインスタンスのゴーストプロセス自動削除
 * @why ターミナル強制終了等で残ったゴーストがレート制限競合を引き起こすのを防ぐ
 * @related instance-coordinator.ts, settings.json
 * @public_api default (ExtensionAPI)
 * @invariants ロックファイル削除は実行中でないプロセスのみ対象
 * @side_effects ~/.pi/runtime/instances/*.lock ファイル削除
 * @failure_modes 権限エラー、ファイルシステムエラー
 *
 * @abdd.explain
 * @overview pi起動時に古いインスタンスロックファイルを検出・削除する
 * @what_it_does 他のpiインスタンスのPIDを確認し、実行中でなければロックを削除
 * @why_it_exists ゴーストプロセスによるレート制限競合を防ぐ
 * @scope(in) なし
 * @scope(out) ロックファイル削除、ログ出力
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * ゴーストバスター設定
 */
interface GhostBusterConfig {
	/** 有効/無効 */
	enabled: boolean;
	/** ロックファイルのタイムアウト（ミリ秒）。デフォルト60秒 */
	staleTimeoutMs: number;
	/** 起動時にクリーンアップを実行するか */
	cleanupOnStart: boolean;
	/** 削除前に確認を求めるか */
	verbose: boolean;
}

const DEFAULT_CONFIG: GhostBusterConfig = {
	enabled: true,
	staleTimeoutMs: 60000, // 60秒（piのハートビートタイムアウトと同じ）
	cleanupOnStart: true,
	verbose: true,
};

/**
 * プロセスが実行中か確認
 */
function isProcessRunning(pid: number): boolean {
	try {
		// macOS/Linux: kill -0 はシグナルを送らず存在確認のみ
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * プロセスがpiプロセスか確認
 */
function isPiProcess(pid: number): boolean {
	try {
		const output = execSync(`ps -p ${pid} -o comm= 2>/dev/null`, {
			encoding: "utf-8",
		}).trim();
		return output === "pi" || output.includes("node");
	} catch {
		return false;
	}
}

/**
 * ロックファイルからインスタンス情報を解析
 */
function parseLockFile(filePath: string): { instanceId: string; pid: number } | null {
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		// ファイル名からインスタンスIDを抽出
		const fileName = path.basename(filePath, ".lock");
		// PIDをファイル名から抽出 (sess-unknown-pid39179-mm6absik-a22c022c)
		const pidMatch = fileName.match(/pid(\d+)/);
		if (!pidMatch) return null;

		return {
			instanceId: fileName,
			pid: parseInt(pidMatch[1], 10),
		};
	} catch {
		return null;
	}
}

/**
 * ゴーストロックファイルを検出・削除
 */
function cleanupGhostLocks(config: GhostBusterConfig, ctx?: ExtensionAPI): string[] {
	if (!config.enabled) return [];

	const instancesDir = path.join(
		process.env.HOME || "~",
		".pi",
		"runtime",
		"instances"
	);

	if (!fs.existsSync(instancesDir)) {
		return [];
	}

	const lockFiles = fs.readdirSync(instancesDir).filter((f) => f.endsWith(".lock"));
	const removed: string[] = [];
	const now = Date.now();

	for (const lockFile of lockFiles) {
		const lockPath = path.join(instancesDir, lockFile);
		const info = parseLockFile(lockPath);

		if (!info) {
			// 解析不能なロックファイルは削除
			if (config.verbose && ctx) {
				ctx.ui.notify(`Removing invalid lock file: ${lockFile}`, "info");
			}
			fs.unlinkSync(lockPath);
			removed.push(lockFile);
			continue;
		}

		// 自分自身のロックはスキップ
		if (info.pid === process.pid) {
			continue;
		}

		// プロセスが実行中か確認
		if (isProcessRunning(info.pid)) {
			// 実行中だがpiプロセスでない場合はゴースト可能性あり
			if (!isPiProcess(info.pid)) {
				if (config.verbose && ctx) {
					ctx.ui.notify(
						`Removing stale lock (PID ${info.pid} is not pi): ${lockFile}`,
						"info"
					);
				}
				fs.unlinkSync(lockPath);
				removed.push(lockFile);
			}
			continue;
		}

		// プロセスが存在しない = ゴースト
		if (config.verbose && ctx) {
			ctx.ui.notify(`Removing ghost lock (PID ${info.pid} dead): ${lockFile}`, "info");
		}
		fs.unlinkSync(lockPath);
		removed.push(lockFile);
	}

	return removed;
}

/**
 * ゴーストバスター拡張機能
 *
 * @summary pi起動時にゴースプロックを削除
 * @param pi ExtensionAPI
 */

// モジュールレベルのフラグ（reload時のリスナー重複登録防止）
let isInitialized = false;

export default function (pi: ExtensionAPI) {
	// 既に初期化済みの場合はスキップ（reload時の重複登録防止）
	if (isInitialized) {
		return;
	}
	isInitialized = true;

	const config: GhostBusterConfig = {
		...DEFAULT_CONFIG,
		// TODO: settings.json から設定を読み込む
	};

	// 起動時にクリーンアップ実行（session_startイベントで）
	pi.on("session_start", async (_event, ctx) => {
		if (!config.cleanupOnStart) return;

		const removed = cleanupGhostLocks(config, ctx);
		if (removed.length > 0) {
			ctx.ui.notify(`Ghost Buster: Removed ${removed.length} stale lock(s)`, "info");
		}
	});

	// 手動クリーンアップコマンドを登録
	pi.registerCommand("ghost-buster", {
		description: "Remove stale pi instance locks",
		handler: (args, ctx) => {
			const removed = cleanupGhostLocks(config, ctx);
			if (removed.length === 0) {
				ctx.ui.notify("Ghost Buster: No stale locks found", "info");
			} else {
				ctx.ui.notify(`Ghost Buster: Removed ${removed.length} stale lock(s):\n${removed.join("\n")}`, "info");
			}
		},
	});

	// セッション終了時にリスナー重複登録防止フラグをリセット
	pi.on("session_shutdown", async () => {
		isInitialized = false;
	});
}
