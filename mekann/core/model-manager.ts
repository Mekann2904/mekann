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
	/** Called when a persisted ref is not selectable in `/model`. */
	onUnavailableRef?: (requested: ModelRef) => void;
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

export function createModelManager(options: ModelManagerOptions) {
	async function trySetModel(ref: ModelRef | undefined, ctx: ExtensionContext, label: string): Promise<ModelLookupResult> {
		if (!ref) return "not_found";
		const { model, resolvedRef } = await resolveModelRef(ref, ctx);
		if (!model) {
			options.onUnavailableRef?.(ref);
			ctx.ui.notify(`${label}: モデル ${formatModelRef(ref)} は /model で選択可能なモデルではありません。コンフィグから削除します`, "warning");
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
