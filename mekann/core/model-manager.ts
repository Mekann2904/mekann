import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Provider + modelId pair identifying a specific model. */
export interface ModelRef { provider: string; modelId: string; }

/** Result of attempting to switch to a model preference. */
export type ModelLookupResult = "ok" | "not_found" | "no_key";

type RegistryModel = NonNullable<ExtensionContext["model"]>;

export interface ModelManagerOptions {
	pi: Pick<ExtensionAPI, "setModel">;
	withModelSuppressed?: <T>(fn: () => Promise<T>) => Promise<T>;
	/** Called when a fuzzy/legacy ref is resolved to a concrete provider/model id. */
	onResolvedRef?: (requested: ModelRef, resolved: ModelRef) => void;
}

/** Pi thinking levels. Kept here so model/thinking persistence is not owned by modes. */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModeModelPersistenceOptions<Mode extends string> {
	pi: Pick<ExtensionAPI, "on" | "getThinkingLevel">;
	getMode: () => Mode;
	isModelSuppressed?: () => boolean;
	isThinkingSuppressed?: () => boolean;
	persistModel: (mode: Mode, ref: ModelRef) => void;
	persistThinking: (mode: Mode, level: ThinkingLevel) => void;
}

/** Format a ModelRef as "provider/modelId". */
export function formatModelRef(ref?: ModelRef): string {
	return ref ? `${ref.provider}/${ref.modelId}` : "(not set)";
}

/** Compare two ModelRef values for equality. */
export function sameModelRef(a: ModelRef | undefined, b: ModelRef | undefined): boolean {
	return a === b ? true : !a || !b ? false : a.provider === b.provider && a.modelId === b.modelId;
}

function isAliasLike(modelId: string): boolean {
	return modelId.endsWith("-latest") || !/-\d{8}$/.test(modelId);
}

function pickBestModel(matches: RegistryModel[]): RegistryModel | undefined {
	if (matches.length === 0) return undefined;
	const aliases = matches.filter((m) => isAliasLike(m.id));
	const pool = aliases.length > 0 ? aliases : matches;
	return [...pool].sort((a, b) => b.id.localeCompare(a.id))[0];
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveModelRefWithStartupRetry(ref: ModelRef, ctx: ExtensionContext): Promise<{ model?: RegistryModel; resolvedRef?: ModelRef }> {
	const delays = [0, 100, 300] as const;
	let last: { model?: RegistryModel; resolvedRef?: ModelRef } = {};
	for (const delay of delays) {
		if (delay > 0) await sleep(delay);
		last = await resolveModelRef(ref, ctx);
		if (last.model) return last;
	}
	return last;
}

/**
 * Resolve persisted model refs robustly.
 *
 * Older configs may contain short/fuzzy ids such as `anthropic/sonnet`.
 * Resolve only against models that are selectable in `/model` (`getAvailable`).
 * Never canonicalize to a model that lacks configured auth, because that can
 * silently persist an expensive/unavailable model the user never selected.
 */
export async function resolveModelRef(ref: ModelRef, ctx: ExtensionContext): Promise<{ model?: RegistryModel; resolvedRef?: ModelRef }> {
	const getAvailable = (ctx.modelRegistry as { getAvailable?: () => RegistryModel[] | Promise<RegistryModel[]> }).getAvailable;
	if (typeof getAvailable !== "function") {
		const exact = ctx.modelRegistry.find(ref.provider, ref.modelId);
		return exact ? { model: exact, resolvedRef: { provider: exact.provider, modelId: exact.id } } : {};
	}

	const availableModels = await Promise.resolve(getAvailable.call(ctx.modelRegistry));
	const providerModels = availableModels.filter((m) => m.provider?.toLowerCase() === ref.provider.toLowerCase());
	if (providerModels.length === 0) return {};

	const needle = ref.modelId.toLowerCase();
	const exactCaseInsensitive = providerModels.find((m) => m.id.toLowerCase() === needle);
	const model = exactCaseInsensitive ?? pickBestModel(providerModels.filter((m) =>
		m.id.toLowerCase().includes(needle) || (typeof m.name === "string" && m.name.toLowerCase().includes(needle)),
	));
	return model ? { model, resolvedRef: { provider: model.provider, modelId: model.id } } : {};
}

export function registerModeModelPersistence<Mode extends string>(options: ModeModelPersistenceOptions<Mode>): void {
	function persistCurrentThinking(mode: Mode): void {
		if (options.isThinkingSuppressed?.()) return;
		const level = options.pi.getThinkingLevel?.() as ThinkingLevel | undefined;
		if (level) options.persistThinking(mode, level);
	}

	options.pi.on("model_select", async (event) => {
		if (event.source === "restore") return;
		if (options.isModelSuppressed?.()) return;
		const mode = options.getMode();
		options.persistModel(mode, { provider: event.model.provider, modelId: event.model.id });
		// Model switching may clamp or apply scoped-model effort before model_select
		// is emitted. Persist the effective effort here so Shift+Tab/current effort
		// stays in sync with model management even if no separate thinking event is
		// observed by extensions.
		persistCurrentThinking(mode);
	});

	options.pi.on("thinking_level_select", async (event) => {
		if (options.isThinkingSuppressed?.()) return;
		options.persistThinking(options.getMode(), event.level);
	});
}

export function createModelManager(options: ModelManagerOptions) {
	async function trySetModel(ref: ModelRef | undefined, ctx: ExtensionContext, label: string): Promise<ModelLookupResult> {
		if (!ref) return "not_found";
		const { model, resolvedRef } = await resolveModelRefWithStartupRetry(ref, ctx);
		if (!model) {
			ctx.ui.notify(`${label}: モデル ${formatModelRef(ref)} は /model で選択可能なモデルではないため、今回は復元できませんでした。設定は保持します`, "warning");
			return "not_found";
		}
		if (resolvedRef && !sameModelRef(ref, resolvedRef)) options.onResolvedRef?.(ref, resolvedRef);

		const run = async (): Promise<ModelLookupResult> => {
			const ok = await options.pi.setModel(model);
			if (!ok) {
				ctx.ui.notify(`${label}: ${formatModelRef(resolvedRef ?? ref)} の API key がありません`, "warning");
				return "no_key";
			}
			return "ok";
		};
		return options.withModelSuppressed ? options.withModelSuppressed(run) : run();
	}

	return { trySetModel };
}
