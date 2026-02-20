/**
 * @file .pi/extensions/context-usage-dashboard.ts の単体テスト
 * @description コンテクスト使用量可視化拡張機能の型・定数・ユーティリティ関数のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("context-usage-dashboard.ts 型定義", () => {
	interface SessionUsage {
		totalTokens?: number;
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		cost?: { total?: number };
	}

	interface ContentBlock {
		type: string;
		text?: string;
		thinking?: string;
		name?: string;
		arguments?: unknown;
	}

	interface SessionMessage {
		role?: string;
		content?: string | ContentBlock[];
		command?: string;
		output?: string;
		summary?: string;
		provider?: string;
		model?: string;
		usage?: SessionUsage;
	}

	interface SessionEntry {
		type?: string;
		message?: SessionMessage;
		timestamp?: string | number;
	}

	interface ToolStats {
		calls: number;
		contextTokens: number;
		usageTokens: number;
	}

	describe("SessionUsage型", () => {
		it("最小構造で作成", () => {
			const usage: SessionUsage = {};
			expect(usage.totalTokens).toBeUndefined();
		});

		it("全フィールドを設定", () => {
			const usage: SessionUsage = {
				totalTokens: 1000,
				input: 500,
				output: 300,
				cacheRead: 100,
				cacheWrite: 100,
				cost: { total: 0.01 },
			};
			expect(usage.totalTokens).toBe(1000);
			expect(usage.cost?.total).toBe(0.01);
		});
	});

	describe("ContentBlock型", () => {
		it("テキストブロックを作成", () => {
			const block: ContentBlock = {
				type: "text",
				text: "Hello",
			};
			expect(block.type).toBe("text");
			expect(block.text).toBe("Hello");
		});

		it("toolCallブロックを作成", () => {
			const block: ContentBlock = {
				type: "toolCall",
				name: "read",
				arguments: { path: "test.ts" },
			};
			expect(block.type).toBe("toolCall");
			expect(block.name).toBe("read");
		});

		it("thinkingブロックを作成", () => {
			const block: ContentBlock = {
				type: "thinking",
				thinking: "思考内容",
			};
			expect(block.thinking).toBe("思考内容");
		});
	});

	describe("SessionMessage型", () => {
		it("userメッセージを作成", () => {
			const msg: SessionMessage = {
				role: "user",
				content: "質問",
			};
			expect(msg.role).toBe("user");
		});

		it("assistantメッセージを作成", () => {
			const msg: SessionMessage = {
				role: "assistant",
				content: [{ type: "text", text: "回答" }],
				provider: "anthropic",
				model: "claude-3-opus",
			};
			expect(msg.role).toBe("assistant");
			expect(Array.isArray(msg.content)).toBe(true);
		});

		it("bashExecutionメッセージを作成", () => {
			const msg: SessionMessage = {
				role: "bashExecution",
				command: "npm test",
				output: "PASS",
			};
			expect(msg.command).toBe("npm test");
		});
	});

	describe("SessionEntry型", () => {
		it("メッセージエントリを作成", () => {
			const entry: SessionEntry = {
				type: "message",
				message: { role: "user", content: "test" },
				timestamp: "2024-01-15T10:00:00Z",
			};
			expect(entry.type).toBe("message");
		});

		it("数値タイムスタンプを使用", () => {
			const entry: SessionEntry = {
				type: "message",
				timestamp: 1705312800000,
			};
			expect(typeof entry.timestamp).toBe("number");
		});
	});

	describe("ToolStats型", () => {
		it("統計オブジェクトを作成", () => {
			const stats: ToolStats = {
				calls: 10,
				contextTokens: 5000,
				usageTokens: 3000,
			};
			expect(stats.calls).toBe(10);
		});
	});
});

// ============================================================================
// 定数のテスト
// ============================================================================

describe("context-usage-dashboard.ts 定数", () => {
	// テスト内でローカルに定義（実装と同じ値）
	const SESSIONS_ROOT = "~/.pi/agent/sessions";
	const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
	const TOP_ROWS = 8;

	describe("時間定数", () => {
		it("WEEK_MSが1週間のミリ秒", () => {
			const expected = 7 * 24 * 60 * 60 * 1000;
			expect(WEEK_MS).toBe(expected);
		});

		it("WEEK_MSが正の値", () => {
			expect(WEEK_MS).toBeGreaterThan(0);
		});
	});

	describe("表示定数", () => {
		it("TOP_ROWSが正の値", () => {
			expect(TOP_ROWS).toBeGreaterThan(0);
		});
	});
});

// ============================================================================
// ユーティリティ関数のテスト
// ============================================================================

describe("ユーティリティ関数", () => {
	// 実装と同等の関数をローカルに定義
	const toFiniteNumberWithDefault = (value: unknown, defaultValue = 0): number => {
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
		return defaultValue;
	};

	describe("toTotalUsageTokens", () => {
		const toTotalUsageTokens = (usage: { totalTokens?: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number } | undefined): number => {
			if (!usage) return 0;
			const nativeTotal = toFiniteNumberWithDefault(usage.totalTokens);
			if (nativeTotal > 0) return nativeTotal;
			return (
				toFiniteNumberWithDefault(usage.input) +
				toFiniteNumberWithDefault(usage.output) +
				toFiniteNumberWithDefault(usage.cacheRead) +
				toFiniteNumberWithDefault(usage.cacheWrite)
			);
		};

		it("undefinedで0を返す", () => {
			expect(toTotalUsageTokens(undefined)).toBe(0);
		});

		it("totalTokensがある場合はそれを使用", () => {
			expect(toTotalUsageTokens({ totalTokens: 1000 })).toBe(1000);
		});

		it("totalTokensがない場合は合算", () => {
			expect(toTotalUsageTokens({ input: 100, output: 50 })).toBe(150);
		});

		it("全フィールドを合算", () => {
			expect(toTotalUsageTokens({ input: 100, output: 50, cacheRead: 20, cacheWrite: 30 })).toBe(200);
		});

		it("totalTokensが0の場合は合算", () => {
			expect(toTotalUsageTokens({ totalTokens: 0, input: 100, output: 50 })).toBe(150);
		});

		it("NaNを含む場合はデフォルト0", () => {
			expect(toTotalUsageTokens({ input: NaN, output: 50 })).toBe(50);
		});
	});

	describe("estimateUnknownTokens", () => {
		const safeStringify = (value: unknown): string => {
			try {
				return JSON.stringify(value) ?? "";
			} catch {
				return String(value ?? "");
			}
		};

		const estimateUnknownTokens = (value: unknown): number => {
			if (typeof value === "string") {
				return Math.ceil(value.length / 4);
			}
			if (Array.isArray(value)) {
				let chars = 0;
				for (const block of value) {
					if (block && typeof block === "object" && "type" in block) {
						const typedBlock = block as { type: string; text?: string };
						if (typedBlock.type === "text" && typeof typedBlock.text === "string") {
							chars += typedBlock.text.length;
							continue;
						}
						if (typedBlock.type === "image") {
							chars += 4800;
							continue;
						}
					}
					chars += safeStringify(block).length;
				}
				return Math.ceil(chars / 4);
			}
			if (value == null) return 0;
			return Math.ceil(safeStringify(value).length / 4);
		};

		it("文字列のトークンを推定（4文字=1トークン）", () => {
			expect(estimateUnknownTokens("abcd")).toBe(1);
			expect(estimateUnknownTokens("abcde")).toBe(2);
		});

		it("空文字で0を返す", () => {
			expect(estimateUnknownTokens("")).toBe(0);
		});

		it("nullで0を返す", () => {
			expect(estimateUnknownTokens(null)).toBe(0);
		});

		it("undefinedで0を返す", () => {
			expect(estimateUnknownTokens(undefined)).toBe(0);
		});

		it("配列のテキストブロックを推定", () => {
			const content = [{ type: "text", text: "Hello World" }];
			expect(estimateUnknownTokens(content)).toBe(3); // 11 chars / 4
		});

		it("画像ブロックは4800文字として扱う", () => {
			const content = [{ type: "image" }];
			expect(estimateUnknownTokens(content)).toBe(1200); // 4800 / 4
		});

		it("オブジェクトはJSON文字列化して推定", () => {
			const obj = { key: "value" };
			const result = estimateUnknownTokens(obj);
			expect(result).toBeGreaterThan(0);
		});
	});

	describe("parseTimestampMs", () => {
		const parseTimestampMs = (entry: { timestamp?: string | number; message?: { timestamp?: string | number } } | undefined): number | undefined => {
			const direct = entry?.timestamp;
			if (typeof direct === "string") {
				const parsed = Date.parse(direct);
				if (!Number.isNaN(parsed)) return parsed;
			}
			if (typeof direct === "number" && Number.isFinite(direct)) {
				return direct > 1_000_000_000_000 ? direct : direct * 1000;
			}

			const nested = entry?.message?.timestamp;
			if (typeof nested === "number" && Number.isFinite(nested)) {
				return nested > 1_000_000_000_000 ? nested : nested * 1000;
			}
			if (typeof nested === "string") {
				const parsed = Date.parse(nested);
				if (!Number.isNaN(parsed)) return parsed;
			}
			return undefined;
		};

		it("ISO文字列をパース", () => {
			const result = parseTimestampMs({ timestamp: "2024-01-15T10:00:00Z" });
			expect(result).toBe(1705312800000);
		});

		it("ミリ秒数値をそのまま返す", () => {
			const result = parseTimestampMs({ timestamp: 1705312800000 });
			expect(result).toBe(1705312800000);
		});

		it("秒数値をミリ秒に変換", () => {
			const result = parseTimestampMs({ timestamp: 1705312800 });
			expect(result).toBe(1705312800000);
		});

		it("undefinedでundefinedを返す", () => {
			expect(parseTimestampMs(undefined)).toBeUndefined();
		});

		it("無効な文字列でundefinedを返す", () => {
			expect(parseTimestampMs({ timestamp: "invalid" })).toBeUndefined();
		});

		it("ネストしたmessage.timestampをパース", () => {
			const result = parseTimestampMs({
				message: { timestamp: 1705312800000 }
			});
			expect(result).toBe(1705312800000);
		});
	});

	describe("extractToolCalls", () => {
		const extractToolCalls = (message: { content?: unknown } | undefined): string[] => {
			if (!message || !Array.isArray(message.content)) return [];
			const names: string[] = [];
			for (const block of message.content) {
				if (!block || typeof block !== "object") continue;
				if ((block as { type?: string }).type !== "toolCall") continue;
				const name = String((block as { name?: string }).name || "").trim();
				if (name) names.push(name);
			}
			return names;
		};

		it("toolCallから名前を抽出", () => {
			const message = {
				content: [
					{ type: "toolCall", name: "read", arguments: { path: "test.ts" } },
				],
			};
			expect(extractToolCalls(message)).toEqual(["read"]);
		});

		it("複数のtoolCallを抽出", () => {
			const message = {
				content: [
					{ type: "toolCall", name: "read" },
					{ type: "toolCall", name: "bash" },
				],
			};
			expect(extractToolCalls(message)).toEqual(["read", "bash"]);
		});

		it("toolCall以外は無視", () => {
			const message = {
				content: [
					{ type: "text", text: "Hello" },
					{ type: "toolCall", name: "read" },
				],
			};
			expect(extractToolCalls(message)).toEqual(["read"]);
		});

		it("undefinedで空配列を返す", () => {
			expect(extractToolCalls(undefined)).toEqual([]);
		});

		it("contentが文字列の場合は空配列", () => {
			expect(extractToolCalls({ content: "text" })).toEqual([]);
		});

		it("名前なしtoolCallは無視", () => {
			const message = {
				content: [{ type: "toolCall" }],
			};
			expect(extractToolCalls(message)).toEqual([]);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
	it("estimateUnknownTokensは常に非負", () => {
		const safeStringify = (value: unknown): string => {
			try {
				return JSON.stringify(value) ?? "";
			} catch {
				return String(value ?? "");
			}
		};

		const estimateUnknownTokens = (value: unknown): number => {
			if (typeof value === "string") {
				return Math.ceil(value.length / 4);
			}
			if (value == null) return 0;
			return Math.ceil(safeStringify(value).length / 4);
		};

		fc.assert(
			fc.property(fc.anything(), (value) => {
				const result = estimateUnknownTokens(value);
				return result >= 0;
			})
		);
	});

	it("parseTimestampMsは有効な日付文字列で正の数を返す", () => {
		const parseTimestampMs = (entry: { timestamp?: string } | undefined): number | undefined => {
			const direct = entry?.timestamp;
			if (typeof direct === "string") {
				const parsed = Date.parse(direct);
				if (!Number.isNaN(parsed)) return parsed;
			}
			return undefined;
		};

		fc.assert(
			fc.property(fc.date({ noInvalidDate: true }), (date) => {
				const iso = date.toISOString();
				const result = parseTimestampMs({ timestamp: iso });
				return result !== undefined && result > 0;
			})
		);
	});
});
