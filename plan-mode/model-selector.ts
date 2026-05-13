/**
 * プランモード用モデルセレクタUI
 *
 * piの内蔵 /model コマンドと同じ体験のモデル選択UI:
 * - プロバイダー別グループ表示
 * - 現在のモデルをハイライト
 * - キーボードナビゲーション＋フィルタリング
 */

import type { Api, Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

export interface ModelSelection {
	provider: string;
	modelId: string;
}

/**
 * piの /model と同じ体験のモデルセレクタを開く。
 * 選択されたモデル、またはキャンセル時は undefined を返す。
 */
export async function showModelSelector(
	ctx: ExtensionContext,
	title: string,
	currentSelection?: ModelSelection,
): Promise<Model<Api> | undefined> {
	if (!ctx.hasUI) return undefined;

	const available = await ctx.modelRegistry.getAvailable();

	if (available.length === 0) {
		ctx.ui.notify("利用可能なモデルがありません。APIキーを設定してください。", "warning");
		return undefined;
	}

	// プロバイダー別にグループ化
	const groups = new Map<string, Model<Api>[]>();
	for (const model of available) {
		const provider = model.provider;
		if (!groups.has(provider)) groups.set(provider, []);
		groups.get(provider)!.push(model);
	}

	// プロバイダー名でソート
	const sortedProviders = [...groups.keys()].sort();

	// プロバイダー別に選択アイテムを構築
	const modelByIndex = new Map<string, Model<Api>>();
	const items: SelectItem[] = [];
	for (const provider of sortedProviders) {
		const models = groups.get(provider)!;
		models.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

		for (const model of models) {
			const isCurrent =
				currentSelection &&
				model.provider === currentSelection.provider &&
				model.id === currentSelection.modelId;

			const key = String(modelByIndex.size);
			modelByIndex.set(key, model);

			const label = model.name || model.id;
			const prefix = isCurrent ? "● " : "  ";
			const suffix = model.reasoning ? " (推論)" : "";

			items.push({
				value: key,
				label: `${prefix}${label}${suffix}`,
				description: provider,
			});
		}
	}

	const result = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const container = new Container();
		container.addChild(new DynamicBorder((str: string) => theme.fg("accent", str)));

		// ヘッダー
		container.addChild(new Text(theme.fg("accent", theme.bold(title))));

		if (currentSelection) {
			container.addChild(
				new Text(
					theme.fg(
						"muted",
						`現在: ${currentSelection.provider}/${currentSelection.modelId}`,
					),
				),
			);
		}

		// SelectList
		const selectList = new SelectList(items, Math.min(items.length, 15), {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});

		selectList.onSelect = (item) => done(item.value);
		selectList.onCancel = () => done(null);

		container.addChild(selectList);

		// フッターヒント
		container.addChild(new Text(theme.fg("dim", "↑↓ 移動 • 入力で絞り込み • enter 選択 • esc キャンセル")));

		container.addChild(new DynamicBorder((str: string) => theme.fg("accent", str)));

		return {
			render(width: number) {
				return container.render(width);
			},
			invalidate() {
				container.invalidate();
			},
			handleInput(data: string) {
				selectList.handleInput(data);
				tui.requestRender();
			},
		};
	});

	if (!result) return undefined;

	return modelByIndex.get(result) ?? undefined;
}
