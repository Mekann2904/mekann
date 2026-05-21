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
 * Older configs may contain short/fuzzy ids such as `anthropic/sonnet`. A raw
 * registry.find(provider, id) only accepts exact ids, so resolve against the
 * current registry before giving up.
 */
export function resolveModelRef(ref: ModelRef, ctx: ExtensionContext): { model?: RegistryModel; resolvedRef?: ModelRef } {
	const exact = ctx.modelRegistry.find(ref.provider, ref.modelId);
	if (exact) return { model: exact, resolvedRef: { provider: exact.provider, modelId: exact.id } };

	const getAll = (ctx.modelRegistry as { getAll?: () => RegistryModel[] }).getAll;
	const allModels = typeof getAll === "function" ? getAll.call(ctx.modelRegistry) : [];
	const providerModels = allModels.filter((m) => m.provider.toLowerCase() === ref.provider.toLowerCase());
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
		const { model, resolvedRef } = resolveModelRef(ref, ctx);
		if (!model) {
			ctx.ui.notify(`${label}: モデル ${formatModelRef(ref)} が見つかりません。コンフィグは保持します`, "warning");
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
