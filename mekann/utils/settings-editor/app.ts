import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { EffectiveSetting, SettingsScope } from "../../settings/types.js";
import type { ModelCatalogItem } from "./model-ipc.js";
import {
	ALL_FEATURE,
	cancelEdit,
	clearDraftsAfterApply,
	initialSettingsEditorState,
	itemId,
	openEdit,
	openModelPicker,
	selectFeature,
	stageDraft,
	toggleScope,
	type DraftChange,
	type SettingsEditorMode,
} from "./state.js";
import {
	C,
	ContentHeader,
	ColumnHeader,
	DetailPanel,
	DiffOverlay,
	EditOverlay,
	FeatureHeader,
	ModeHeader,
	ModelPickerOverlay,
	SettingRow,
	Sidebar,
	StatusBar,
	buildFeatureGroups,
	el,
	featureTitle,
	modeFromSetting,
	settingsColumns,
	supportedThinking,
	valueText,
	type AppMode,
	type ApplyResult,
	type SettingsEditorAppProps,
} from "./appComponents.js";
export type { DraftChange } from "./state.js";
export type { ApplyResult, SettingsEditorAppProps } from "./appComponents.js";


// ─── Main App ─────────────────────────────────────────────────────

export function SettingsEditorApp({
	effective,
	diagnostics,
	models,
	onApply,
	onQuit,
}: SettingsEditorAppProps) {
	const { width: terminalWidth } = useTerminalDimensions();
	const settingsScrollRef = useRef<ScrollBoxRenderable>(null);

	const [editor, setEditor] = useState(initialSettingsEditorState);
	const { selected, scope, mode, buffer, modelSelected, drafts, message, activeFeature } = editor;
	const setSelected = (value: number | ((n: number) => number)) => setEditor((s) => ({ ...s, selected: typeof value === "function" ? value(s.selected) : value }));
	const setMode = (mode: AppMode) => setEditor((s) => ({ ...s, mode }));
	const setBuffer = (value: string | ((s: string) => string)) => setEditor((s) => ({ ...s, buffer: typeof value === "function" ? value(s.buffer) : value }));
	const setModelSelected = (value: number | ((n: number) => number)) => setEditor((s) => ({ ...s, modelSelected: typeof value === "function" ? value(s.modelSelected) : value }));
	const setDrafts = (value: Record<string, DraftChange> | ((d: Record<string, DraftChange>) => Record<string, DraftChange>)) => setEditor((s) => ({ ...s, drafts: typeof value === "function" ? value(s.drafts) : value }));
	const setMessage = (message: string) => setEditor((s) => ({ ...s, message }));
	const [applying, setApplying] = useState(false);
	const [displayedEffective, setDisplayedEffective] = useState(effective);
	const [displayedDiagnostics, setDisplayedDiagnostics] = useState(diagnostics);

	useEffect(() => setDisplayedEffective(effective), [effective]);
	useEffect(() => setDisplayedDiagnostics(diagnostics), [diagnostics]);

	const items = useMemo(() => displayedEffective, [displayedEffective]);
	const groups = useMemo(() => buildFeatureGroups(items), [items]);

	const activeGroup = useMemo(
		() => groups.find((g) => g.feature === activeFeature),
		[groups, activeFeature],
	);
	// Settings for the currently active feature (all items when "All")
	const featureItems = useMemo(
		() => activeFeature === ALL_FEATURE ? items : (activeGroup?.items ?? []),
		[activeFeature, activeGroup, items],
	);

	const current = featureItems[Math.min(selected, Math.max(0, featureItems.length - 1))];
	const currentDraft = current ? drafts[itemId(current)] : undefined;

	// When switching features, reset selected and scroll
	const switchFeature = useCallback((feature: string) => {
		setEditor((s) => selectFeature(s, feature, featureTitle(feature)));
	}, [mode]);

	// Scroll selected row into view
	useEffect(() => {
		settingsScrollRef.current?.scrollChildIntoView(`setting-row-${selected}`);
	}, [selected, featureItems.length]);

	const stage = useCallback(
		(item: EffectiveSetting, raw: string) => {
			setEditor((s) => stageDraft(s, item, raw));
		},
		[scope],
	);

	const shownValueFor = useCallback((item: EffectiveSetting): string => {
		return drafts[itemId(item)]?.raw ?? valueText(item.effectiveValue);
	}, [drafts]);

	const activateSetting = useCallback((item: EffectiveSetting) => {
		const shown = shownValueFor(item);
		if (item.schema.type === "modelRef") {
			setEditor(openModelPicker);
		} else if (item.schema.type === "enum") {
			const values = item.feature === "modes" && item.key.startsWith("thinking.") ? supportedThinking(models, item, items, drafts) : (item.schema.enumValues ?? []);
			const idx = Math.max(0, values.indexOf(shown));
			stage(item, values[(idx + 1) % values.length] ?? "");
		} else if (item.schema.type === "boolean") {
			const draft = drafts[itemId(item)]?.raw;
			const cur = draft === undefined ? item.effectiveValue : /^(true|1|yes|on)$/i.test(draft);
			stage(item, String(!cur));
		} else {
			setEditor((s) => openEdit(s, item, shown));
		}
	}, [drafts, items, models, shownValueFor, stage]);

	// Model picker confirm
	const confirmModel = useCallback(() => {
		if (!current || !models[modelSelected]) return;
		const m = models[modelSelected];
		stage(current, `${m.provider}/${m.modelId}`);
		setMode("list");
	}, [current, models, modelSelected, stage]);

	const selectSettingByMouse = useCallback((index: number) => {
		if (index === selected) {
			// Already selected: single click activates (cycle/toggle/pick)
			const item = featureItems[index];
			if (item) activateSetting(item);
			return;
		}
		// Not selected yet: just select it
		setSelected(index);
	}, [selected, activateSetting, featureItems]);

	// ─── Keyboard ──────────────────────────────────────────────

	useKeyboard((key) => {
		if (key.ctrl && key.name === "c") { onQuit(); return; }

		if (mode === "edit") {
			if (key.name === "escape") { setEditor(cancelEdit); return; }
			if (key.name === "backspace" || key.name === "delete") { setBuffer((b) => b.slice(0, -1)); return; }
			if (key.name === "return" || key.name === "enter") { if (current) stage(current, buffer); setMode("list"); return; }
			if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) setBuffer((b) => b + key.sequence);
			return;
		}

		if (mode === "models") {
			if (key.name === "escape") { setMode("list"); return; }
			if (key.name === "up") setModelSelected((i) => Math.max(0, i - 1));
			else if (key.name === "down") setModelSelected((i) => Math.min(models.length - 1, i + 1));
			else if ((key.name === "return" || key.name === "enter") && current && models[modelSelected]) {
				confirmModel();
			}
			return;
		}

		// Feature navigation: ←→ keys (cycle through All + features)
		if (key.name === "left") {
			const features = [ALL_FEATURE, ...groups.map((g) => g.feature)];
			const idx = features.indexOf(activeFeature);
			const prev = features[idx <= 0 ? features.length - 1 : idx - 1];
			if (prev && prev !== activeFeature) switchFeature(prev);
			return;
		}
		if (key.name === "right") {
			const features = [ALL_FEATURE, ...groups.map((g) => g.feature)];
			const idx = features.indexOf(activeFeature);
			const next = features[idx >= features.length - 1 ? 0 : idx + 1];
			if (next && next !== activeFeature) switchFeature(next);
			return;
		}

		if (key.name === "q") { onQuit(); return; }
		if (key.name === "up") setSelected((i) => Math.max(0, i - 1));
		else if (key.name === "down") setSelected((i) => Math.min(featureItems.length - 1, i + 1));
		else if (key.name === "tab") {
			setEditor(toggleScope);
		}
		else if (key.name === "d") setMode(mode === "diff" ? "list" : "diff");
		else if ((key.name === "return" || key.name === "enter") && current) {
			activateSetting(current);
		} else if (key.name === "a" && !applying) {
			const changes = Object.values(drafts);
			if (changes.length === 0) { setMessage("no drafts to apply"); return; }
			setApplying(true);
			void onApply(changes).then((result) => {
				setApplying(false);
				if (result.error) setMessage(`✗ ${result.error}`);
				else {
					if (result.effective) setDisplayedEffective(result.effective);
					if (result.diagnostics) setDisplayedDiagnostics(result.diagnostics);
					setEditor(clearDraftsAfterApply);
				}
			});
		}
	});

	// ─── Build setting rows for active feature ─────────────────

	const showSidebar = terminalWidth >= 64;
	const sidebarWidth = showSidebar ? 27 : 0;
	const contentWidth = Math.max(20, terminalWidth - sidebarWidth - 1);
	const columns = settingsColumns(contentWidth);
	const rows: React.ReactNode[] = [];
	const isAll = activeFeature === ALL_FEATURE;
	if (isAll) {
		let globalIdx = 0;
		for (let gi = 0; gi < groups.length; gi++) {
			const group = groups[gi];
			let lastMode: string | undefined;
			rows.push(el(FeatureHeader, { feature: group.feature, key: `h-${group.feature}` }));
			for (let j = 0; j < group.items.length; j++) {
				const item = group.items[j];
				const mode = modeFromSetting(item);
				if (mode && mode !== lastMode) {
					rows.push(el(ModeHeader, { mode, key: `mh-${group.feature}-${mode}` }));
					lastMode = mode;
				}
				const draft = drafts[itemId(item)];
				rows.push(el(SettingRow, {
					key: itemId(item),
					item, index: globalIdx,
					isSelected: globalIdx === selected,
					hasDraft: !!draft,
					draftValue: draft?.raw ?? "",
					draftScope: draft?.scope ?? "",
					columns,
					onSelect: selectSettingByMouse,
				}));
				globalIdx++;
			}
		}
	} else {
		let lastMode: string | undefined;
		for (let j = 0; j < featureItems.length; j++) {
			const item = featureItems[j];
			const mode = modeFromSetting(item);
			if (mode && mode !== lastMode) {
				rows.push(el(ModeHeader, { mode, key: `mh-${mode}` }));
				lastMode = mode;
			}
			const draft = drafts[itemId(item)];
			rows.push(el(SettingRow, {
				key: itemId(item),
				item, index: j,
				isSelected: j === selected,
				hasDraft: !!draft,
				draftValue: draft?.raw ?? "",
				draftScope: draft?.scope ?? "",
				columns,
				onSelect: selectSettingByMouse,
			}));
		}
	}

	// ─── Render ────────────────────────────────────────────────

	const showDetail = current !== undefined && mode === "list" && contentWidth >= 56;

	return el("box", {
		style: { flexDirection: "column", width: "100%", height: "100%", backgroundColor: C.bg },
	},
		// ── Main area (sidebar + content) ──
		el("box", {
			style: { flexDirection: "row", width: "100%", flexGrow: 1, paddingBottom: 2 },
		},
			// Sidebar
			...(showSidebar ? [el(Sidebar, {
				groups,
				activeFeature,
				drafts,
				diagnostics: displayedDiagnostics,
				totalItems: items.length,
				totalModels: models.length,
				onSelectFeature: switchFeature,
			})] : []),
			// Vertical separator
			...(showSidebar ? [el("box", {
				style: { width: 1, height: "100%", backgroundColor: C.separator },
			})] : []),
			// Content area
			el("box", {
				style: { flexGrow: 1, height: "100%", flexDirection: "column", backgroundColor: C.contentBg, paddingRight: 1 },
			},
				el(ContentHeader, { feature: activeFeature, count: featureItems.length, featureGroups: groups }),
				el(ColumnHeader, { columns }),
				el("scrollbox", {
					ref: settingsScrollRef,
					style: { width: "100%", flexGrow: 1, backgroundColor: C.contentBg },
					scrollY: true,
					viewportCulling: true,
					focused: true,
				}, ...rows),
				// Inline detail panel (conditional)
				...(showDetail
					? [el(DetailPanel, { item: current, draft: currentDraft, drafts, models, allItems: items, scope })]
					: []
				),
			),
		),
		// ── Status bar ──
		el(StatusBar, { message, scope, draftCount: Object.keys(drafts).length, diagnosticsCount: displayedDiagnostics.length, mode, currentType: current?.schema.type ?? "" }),
		// ── Overlays ──
		...(mode === "edit" && current ? [el(EditOverlay, { settingKey: itemId(current), buffer, type: current.schema.type })] : []),
		...(mode === "diff" ? [el(DiffOverlay, { drafts, items })] : []),
		...(mode === "models" ? [el(ModelPickerOverlay, { models, selected: modelSelected, onSelect: setModelSelected, onConfirm: confirmModel })] : []),
	);
}
