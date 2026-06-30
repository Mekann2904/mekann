import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	fetchCodexModels,
	selectDefaultModel,
	getCachedCodexModels,
	invalidateCodexModelsCache,
	clearCodexModelsCache,
	sweepCodexModelsCache,
	codexModelsCacheSize,
} from "./models.js";
import { CodexError } from "./errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(response: { status: number; body: unknown }) {
	return vi.fn(async () => {
		const text =
			typeof response.body === "string"
				? response.body
				: JSON.stringify(response.body);
		return {
			ok: response.status >= 200 && response.status < 300,
			status: response.status,
			text: async () => text,
			json: async () => response.body,
		};
	});
}

const defaultOpts = {
	token: "tok",
	accountId: "acct",
	fetchImpl: mockFetch({
		status: 200,
		body: { models: [] },
	}),
} as const;

// ---------------------------------------------------------------------------
// fetchCodexModels
// ---------------------------------------------------------------------------

describe("fetchCodexModels", () => {
	it("maps model list correctly", async () => {
		const fetchImpl = mockFetch({
			status: 200,
			body: {
				models: [
					{ slug: "gpt-4o", display_name: "GPT-4o", is_default: true },
					{ id: "gpt-3.5", display_name: "GPT-3.5" },
					{ model: "o1", display_name: "O1" },
				],
			},
		});
		const models = await fetchCodexModels({ ...defaultOpts, fetchImpl });
		expect(models).toHaveLength(3);
		expect(models[0]).toEqual({
			id: "gpt-4o",
			name: "GPT-4o",
			isDefault: true,
		});
		expect(models[1]).toEqual({ id: "gpt-3.5", name: "GPT-3.5" });
		expect(models[2]).toEqual({ id: "o1", name: "O1" });
	});

	it("filters out models with empty id", async () => {
		const fetchImpl = mockFetch({
			status: 200,
			body: {
				models: [
					{ slug: "valid" },
					{ slug: "" },
					{},
				],
			},
		});
		const models = await fetchCodexModels({ ...defaultOpts, fetchImpl });
		expect(models).toHaveLength(1);
		expect(models[0]?.id).toBe("valid");
	});

	it("throws CodexError on non-200", async () => {
		const fetchImpl = mockFetch({ status: 429, body: "slow down" });
		await expect(
			fetchCodexModels({ ...defaultOpts, fetchImpl }),
		).rejects.toThrow(CodexError);
		await expect(
			fetchCodexModels({ ...defaultOpts, fetchImpl }),
		).rejects.toThrow(/429/);
	});

	it("masks token/accountId echoed in the error body (IC-225)", async () => {
		const accountId = "acct-secret-99";
		const fetchImpl = mockFetch({
			status: 401,
			body: `Authorization: Bearer leaky.jwt.token account=${accountId}`,
		});
		await expect(
			fetchCodexModels({ token: "tok", accountId, fetchImpl }),
		).rejects.toThrow(CodexError);
		await expect(
			fetchCodexModels({ token: "tok", accountId, fetchImpl }),
		).rejects.not.toThrow(/leaky\.jwt\.token|acct-secret-99/);
	});
});

// ---------------------------------------------------------------------------
// selectDefaultModel
// ---------------------------------------------------------------------------

describe("selectDefaultModel", () => {
	it("selects model with isDefault: true", () => {
		const models = [
			{ id: "a", isDefault: false },
			{ id: "b", isDefault: true },
			{ id: "c", isDefault: false },
		] as const;
		expect(selectDefaultModel([...models])).toBe("b");
	});

	it("returns first model when no isDefault", () => {
		expect(selectDefaultModel([{ id: "x" }, { id: "y" }])).toBe("x");
	});

	it("returns undefined for empty array", () => {
		expect(selectDefaultModel([])).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// getCachedCodexModels / cache management
// ---------------------------------------------------------------------------

describe("getCachedCodexModels", () => {
	beforeEach(() => {
		clearCodexModelsCache();
	});

	afterEach(() => {
		clearCodexModelsCache();
	});

	it("returns models and populates cache", async () => {
		const fetchImpl = mockFetch({
			status: 200,
			body: {
				models: [{ slug: "m1", display_name: "M1", is_default: true }],
			},
		});
		const entry = await getCachedCodexModels({
			token: "tok",
			accountId: "acct",
			fetchImpl,
		});
		expect(entry.models).toHaveLength(1);
		expect(entry.defaultModelId).toBe("m1");
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it("cache hit does not call fetch again", async () => {
		const fetchImpl = mockFetch({
			status: 200,
			body: {
				models: [{ slug: "m1" }],
			},
		});
		await getCachedCodexModels({ token: "tok", accountId: "acct", fetchImpl });
		await getCachedCodexModels({ token: "tok", accountId: "acct", fetchImpl });
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it("re-fetches after TTL expires (fake timers)", async () => {
		vi.useFakeTimers();
		try {
			const fetchImpl = mockFetch({
				status: 200,
				body: { models: [{ slug: "m1" }] },
			});
			await getCachedCodexModels(
				{ token: "tok", accountId: "acct", fetchImpl },
				5000,
			);
			expect(fetchImpl).toHaveBeenCalledOnce();

			// Before expiry → cache hit
			await getCachedCodexModels(
				{ token: "tok", accountId: "acct", fetchImpl },
				5000,
			);
			expect(fetchImpl).toHaveBeenCalledOnce();

			// Advance past TTL
			vi.advanceTimersByTime(6000);

			await getCachedCodexModels(
				{ token: "tok", accountId: "acct", fetchImpl },
				5000,
			);
			expect(fetchImpl).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("inflight dedup: concurrent calls share one fetch", async () => {
		let resolveFetch: (v: unknown) => void;
		const fetchPromise = new Promise((r) => {
			resolveFetch = r;
		});
		const fetchImpl = vi.fn(async () => {
			await fetchPromise;
			return {
				ok: true,
				status: 200,
				text: async () => '{"models":[{"slug":"m1"}]}',
				json: async () => ({ models: [{ slug: "m1" }] }),
			};
		});

		// Fire two concurrent calls
		const p1 = getCachedCodexModels({
			token: "tok",
			accountId: "acct",
			fetchImpl,
		});
		const p2 = getCachedCodexModels({
			token: "tok",
			accountId: "acct",
			fetchImpl,
		});

		// Resolve the single fetch
		resolveFetch!(undefined);

		const [r1, r2] = await Promise.all([p1, p2]);
		expect(r1.models).toEqual(r2.models);
		expect(fetchImpl).toHaveBeenCalledOnce();
	});
});

describe("invalidateCodexModelsCache", () => {
	beforeEach(() => clearCodexModelsCache());
	afterEach(() => clearCodexModelsCache());

	it("removes specific cache entry", async () => {
		const fetchImpl = mockFetch({
			status: 200,
			body: { models: [{ slug: "m1" }] },
		});
		await getCachedCodexModels({
			token: "tok",
			accountId: "acct",
			baseUrl: "https://example.com",
			fetchImpl,
		});
		expect(fetchImpl).toHaveBeenCalledOnce();

		invalidateCodexModelsCache({
			baseUrl: "https://example.com",
			accountId: "acct",
		});

		await getCachedCodexModels({
			token: "tok",
			accountId: "acct",
			baseUrl: "https://example.com",
			fetchImpl,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});
});

describe("clearCodexModelsCache", () => {
	it("clears all cache entries", async () => {
		const fetchImpl = mockFetch({
			status: 200,
			body: { models: [{ slug: "m1" }] },
		});
		await getCachedCodexModels({
			token: "tok",
			accountId: "acct1",
			fetchImpl,
		});
		await getCachedCodexModels({
			token: "tok",
			accountId: "acct2",
			fetchImpl,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);

		clearCodexModelsCache();

		await getCachedCodexModels({
			token: "tok",
			accountId: "acct1",
			fetchImpl,
		});
		await getCachedCodexModels({
			token: "tok",
			accountId: "acct2",
			fetchImpl,
		});
		expect(fetchImpl).toHaveBeenCalledTimes(4);
	});
});

// ---------------------------------------------------------------------------
// Bounded cache: TTL sweep + entry cap (issue #165, IC-226)
// ---------------------------------------------------------------------------

describe("sweepCodexModelsCache (issue #165)", () => {
	beforeEach(() => clearCodexModelsCache());
	afterEach(() => clearCodexModelsCache());

	it("removes TTL-expired entries", async () => {
		const fetchImpl = mockFetch({ status: 200, body: { models: [{ slug: "m1" }] } });
		await getCachedCodexModels(
			{ token: "tok", accountId: "acct", fetchImpl },
			5000,
		);
		expect(codexModelsCacheSize()).toBe(1);

		// Advance past TTL and sweep with an explicit `now`.
		sweepCodexModelsCache(Date.now() + 6000);
		expect(codexModelsCacheSize()).toBe(0);
	});

	it("keeps entries that are still within TTL", async () => {
		const fetchImpl = mockFetch({ status: 200, body: { models: [{ slug: "m1" }] } });
		await getCachedCodexModels(
			{ token: "tok", accountId: "acct", fetchImpl },
			5000,
		);
		sweepCodexModelsCache(Date.now() + 1000);
		expect(codexModelsCacheSize()).toBe(1);
	});

	it("trims the cache to MAX_CACHE_ENTRIES via FIFO eviction", async () => {
		// Populate 70 distinct accounts (MAX_CACHE_ENTRIES = 64).
		const fetchImpl = mockFetch({ status: 200, body: { models: [{ slug: "m1" }] } });
		for (let i = 0; i < 70; i++) {
			await getCachedCodexModels({
				token: "tok",
				accountId: `acct-${i}`,
				fetchImpl,
			});
		}
		// Each access sweeps; the cap must hold.
		expect(codexModelsCacheSize()).toBeLessThanOrEqual(64);
	});

	it("does not resurrect evicted entries: stale account refetches", async () => {
		const fetchImpl = mockFetch({ status: 200, body: { models: [{ slug: "m1" }] } });
		await getCachedCodexModels({
			token: "tok",
			accountId: "acct-old",
			fetchImpl,
		});
		const callsBefore = (fetchImpl as ReturnType<typeof mockFetch>).mock.calls.length;

		// Fill with enough distinct accounts to evict acct-old.
		for (let i = 0; i < 70; i++) {
			await getCachedCodexModels({
				token: "tok",
				accountId: `acct-${i}`,
				fetchImpl,
			});
		}

		// acct-old was evicted; re-requesting must refetch.
		await getCachedCodexModels({
			token: "tok",
			accountId: "acct-old",
			fetchImpl,
		});
		const callsAfter = (fetchImpl as ReturnType<typeof mockFetch>).mock.calls.length;
		expect(callsAfter).toBeGreaterThan(callsBefore);
	});
});
