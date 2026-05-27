import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { ScrollBoxRenderable } from "@opentui/core";
import type { EffectiveSetting, SettingsScope } from "../../settings/types.js";
import type { ModelCatalogItem } from "./model-ipc.js";

// ─── createElement shorthand ──────────────────────────────────────

function el(
	type: string | React.ComponentType<any>,
	props: Record<string, unknown> | null,
	...children: React.ReactNode[]
) {
	return React.createElement(type as any, props as any, ...children);
}

// ─── Types ────────────────────────────────────────────────────────

export interface DraftChange {
	feature: string;
	key: string;
	scope: SettingsScope;
	raw: string;
}
export interface SettingsEditorAppProps {
	effective: EffectiveSetting[];
	diagnostics: string[];
	models: ModelCatalogItem[];
	onApply: (changes: DraftChange[]) => Promise<string | undefined>;
	onQuit: () => void;
}

type AppMode = "list" | "edit" | "models" | "diff";

// ─── Helpers ──────────────────────────────────────────────────────

function itemId(i: EffectiveSetting): string {
	return `${i.feature}.${i.key}`;
}

function valueText(value: unknown): string {
	if (value === undefined) return "(unset)";
	if (value === null) return "(null)";
	if (value && typeof value === "object") {
		const v = value as Record<string, unknown>;
		if (typeof v.provider === "string" && typeof v.modelId === "string")
			return `${v.provider}/${v.modelId}`;
		return JSON.stringify(value);
	}
	return String(value);
}

function pad(s: string, n: number): string {
	return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, Math.max(0, max - 1)) + "…";
}

function supportedThinking(
	models: ModelCatalogItem[],
	item: EffectiveSetting,
	items: EffectiveSetting[],
): string[] {
	const mode = item.key.split(".")[1];
	const modelItem = items.find(
		(i) => i.feature === "plan-mode" && i.key === `models.${mode}`,
	);
	const modelText = valueText(modelItem?.effectiveValue);
	const model = models.find(
		(m) => `${m.provider}/${m.modelId}` === modelText,
	);
	return model?.supportedThinkingLevels?.length
		? model.supportedThinkingLevels
		: (item.schema.enumValues ?? []);
}

// ─── Tokyo Night dark palette ──────────────────────────────────────

const C = {
	// Base backgrounds — deep black tones
	bg: "#11111b",
	bgPanel: "#181825",
	bgSelected: "#33467c",

	// Text — Tokyo Night tones
	fg: "#c0caf5",
	fgDim: "#565f89",
	fgBright: "#d4d4d4",

	// Accent — Tokyo Night blue + Pi dark teal
	accent: "#7aa2f7",
	accentDim: "#3b4261",
	teal: "#8abeb7",

	// Semantic — no red family
	green: "#9ece6a",
	yellow: "#e0af68",
	cyan: "#7dcfff",
	purple: "#bb9af7",
	orange: "#ff9e64",

	// UI chrome
	border: "#3b4261",
	inputBg: "#0d0d14",
	overlayBg: "#0d0d14",
	statusBarBg: "#0d0d14",
	statusKeyBg: "#09090f",
	titleBarBg: "#181825",
	groupHeaderBg: "#1e1e2e",
	rowEvenBg: "#151520",
	rowOddBg: "#11111b",
};

// ─── Feature group info ───────────────────────────────────────────

interface FeatureGroup {
	feature: string;
	items: EffectiveSetting[];
	startIndex: number;
}

function buildFeatureGroups(items: EffectiveSetting[]): FeatureGroup[] {
	const groups: FeatureGroup[] = [];
	let current: FeatureGroup | null = null;
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!current || current.feature !== item.feature) {
			current = { feature: item.feature, items: [], startIndex: i };
			groups.push(current);
		}
		current.items.push(item);
	}
	return groups;
}

function featureIcon(feature: string): string {
	switch (feature) {
		case "plan-mode": return "◈";
		case "sandbox": return "⊘";
		case "subagent": return "⟐";
		case "output-gate": return "◫";
		default: return "◇";
	}
}

function typeIcon(type: string): string {
	switch (type) {
		case "modelRef": return "⊕";
		case "enum": return "◉";
		case "number": return "#";
		case "boolean": return "☐";
		default: return "·";
	}
}

// ─── Sub-components ───────────────────────────────────────────────

function isLeftMouse(event: any): boolean {
	return event?.button === "left" || event?.button === 0 || event?.button === undefined;
}

function SettingRow(p: {
	item: EffectiveSetting;
	index: number;
	isSelected: boolean;
	hasDraft: boolean;
	draftValue: string;
	draftScope: string;
	onSelect: (index: number) => void;
}) {
	const bgColor = p.isSelected ? C.bgSelected : p.index % 2 === 0 ? C.rowEvenBg : C.rowOddBg;
	const keyColor = p.isSelected ? C.fgBright : C.accent;
	const displayValue = p.hasDraft ? p.draftValue : valueText(p.item.effectiveValue);
	const valColor = p.hasDraft ? C.green : C.fg;
	const srcColor = p.hasDraft ? C.yellow : C.fgDim;
	const restartIcon = p.item.schema.restartRequired ? " ↻" : "";

	return el("box", {
		id: `setting-row-${p.index}`,
		style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: bgColor, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
		onMouseDown: (event: any) => { if (isLeftMouse(event)) { p.onSelect(p.index); event?.stopPropagation?.(); } },
	},
		el("text", { fg: C.fgDim, content: `${typeIcon(p.item.schema.type)} ` }),
		el("text", { fg: keyColor, content: pad(p.item.key, 24) }),
		el("text", { fg: valColor, content: pad(displayValue, 28) }),
		el("text", { fg: srcColor, content: truncate((p.hasDraft ? `${p.draftScope}*` : p.item.source) + restartIcon, 10) }),
	);
}

function FeatureHeader(p: { feature: string }) {
	return el("box", {
		style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.groupHeaderBg, paddingLeft: 1 },
	},
		el("text", { fg: C.fgBright, content: `${featureIcon(p.feature)} ${p.feature.toUpperCase()}` }),
	);
}


function ColumnHeader() {
	return el("box", {
		style: { flexDirection: "row", width: "100%", height: 1, paddingLeft: 3, paddingRight: 1 },
	},
		el("text", { fg: C.fgDim, content: pad("SETTING", 24) }),
		el("text", { fg: C.fgDim, content: pad("VALUE", 28) }),
		el("text", { fg: C.fgDim, content: "SOURCE" }),
	);
}

function StatusBar(p: {
	message: string;
	scope: SettingsScope;
	draftCount: number;
	diagnosticsCount: number;
	mode: AppMode;
	currentType: string;
}) {
	const scopeColor = p.scope === "global" ? C.purple : C.cyan;
	const modeLabel: Record<AppMode, string> = { list: "BROWSE", edit: "EDIT", models: "MODEL PICK", diff: "DIFF" };
	const modeColor: Record<AppMode, string> = { list: C.green, edit: C.yellow, models: C.cyan, diff: C.purple };

	// Contextual Enter hint based on current setting type
	let enterHint = "open";
	if (p.mode === "list") {
		if (p.currentType === "modelRef") enterHint = "pick model";
		else if (p.currentType === "enum") enterHint = "cycle";
		else if (p.currentType === "boolean") enterHint = "toggle";
		else enterHint = "edit";
	}

	const statusChildren: React.ReactNode[] = [
		el("text", { fg: modeColor[p.mode], content: ` ${modeLabel[p.mode]} ` }),
		el("text", { fg: C.fgDim, content: " │ " }),
		el("text", { fg: scopeColor, content: `${p.scope}` }),
		el("text", { fg: C.fgDim, content: " │ " }),
		el("text", { fg: p.draftCount > 0 ? C.green : C.fgDim, content: `${p.draftCount} draft${p.draftCount !== 1 ? "s" : ""}` }),
	];
	if (p.diagnosticsCount > 0) {
		statusChildren.push(
			el("text", { fg: C.fgDim, content: " │ " }),
			el("text", { fg: C.orange, content: `⚠ ${p.diagnosticsCount}` }),
		);
	}
	statusChildren.push(
		el("box", { style: { flexGrow: 1 } }),
		el("text", { fg: C.fgDim, content: truncate(p.message, 60) }),
	);

	return el("box", {
		style: { position: "absolute", bottom: 0, width: "100%", height: 2, flexDirection: "column" },
	},
		el("box", {
			style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.statusBarBg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
		}, ...statusChildren),
		el("box", {
			style: { flexDirection: "row", width: "100%", height: 1, backgroundColor: C.statusKeyBg, paddingLeft: 1, paddingRight: 1, alignItems: "center" },
		},
			el("text", { fg: C.fgDim, content: " ↑↓/wheel " }), el("text", { fg: C.fg, content: "nav" }),
			el("text", { fg: C.fgDim, content: "  click " }), el("text", { fg: C.fg, content: "select" }),
			el("text", { fg: C.fgDim, content: "  ⏎ " }), el("text", { fg: C.accent, content: enterHint }),
			el("text", { fg: C.fgDim, content: "  Tab " }), el("text", { fg: C.fg, content: "scope" }),
			el("text", { fg: C.fgDim, content: "  d " }), el("text", { fg: C.fg, content: "diff" }),
			el("text", { fg: C.fgDim, content: "  a " }), el("text", { fg: C.green, content: "apply" }),
			el("text", { fg: C.fgDim, content: "  q " }), el("text", { fg: C.fgDim, content: "quit" }),
		),
	);
}

function DetailPanel(p: {
	item: EffectiveSetting | undefined;
	draft: DraftChange | undefined;
	models: ModelCatalogItem[];
	allItems: EffectiveSetting[];
	scope: SettingsScope;
}) {
	if (!p.item) {
		return el("box", {
			style: { flexGrow: 1, borderStyle: "rounded", borderColor: C.border, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column" },
		}, el("text", { fg: C.fgDim, content: "Select a setting to view details" }));
	}

	const id = itemId(p.item);
	const shown = p.draft?.raw ?? valueText(p.item.effectiveValue);
	const isModel = p.item.schema.type === "modelRef";
	const modelMatch = isModel ? p.models.find((m) => `${m.provider}/${m.modelId}` === shown) : null;

	const children: React.ReactNode[] = [
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.accent, content: `${featureIcon(p.item.feature)} ` }),
			el("text", { fg: C.fgBright, content: id }),
			el("text", { fg: C.fgDim, content: ` (${p.item.schema.type})` }),
		),
		el("text", { fg: C.fg, content: p.item.schema.description }),
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: "Value: " }),
			el("text", { fg: p.draft ? C.green : C.fgBright, content: truncate(shown, 50) }),
		),
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: "Source: " }),
			el("text", { fg: p.item.source === "default" ? C.fgDim : C.teal, content: p.item.source }),
		),
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: "Save to: " }),
			el("text", { fg: p.scope === "global" ? C.purple : C.cyan, content: p.scope }),
		),
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: "Type: " }),
			el("text", { fg: C.teal, content: p.item.schema.type === "modelRef" ? "model" : p.item.schema.type }),
		),
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.fgDim, content: "Default: " }),
			el("text", { fg: C.fgDim, content: valueText(p.item.schema.defaultValue) }),
		),
	];

	if (p.item.schema.restartRequired) {
		children.push(el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.orange, content: "⚠ Restart required" }),
		));
	}
	if (p.item.schema.enumValues && p.item.schema.enumValues.length > 0) {
		children.push(
			el("text", { fg: C.fgDim, content: "Options:" }),
			el("text", { fg: C.fg, content: `  ${p.item.schema.enumValues.join(" │ ")}` }),
		);
	}
	if (modelMatch) {
		children.push(
			el("text", { fg: C.fgDim, content: "Model:" }),
			el("text", { fg: C.fg, content: `  ${modelMatch.label} (${modelMatch.providerLabel})` }),
		);
		if (modelMatch.reasoning) children.push(el("text", { fg: C.teal, content: "  ✓ reasoning" }));
		if (modelMatch.supportedThinkingLevels.length > 0) {
			children.push(el("text", { fg: C.fgDim, content: `  thinking: ${modelMatch.supportedThinkingLevels.join(", ")}` }));
		}
	}
	for (const d of p.item.diagnostics) {
		children.push(el("text", { fg: C.orange, content: `⚠ ${d}` }));
	}

	return el("box", {
		style: { flexGrow: 1, borderStyle: "rounded", borderColor: C.border, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column", gap: 1 },
	}, ...children);
}

function EditOverlay(p: { settingKey: string; buffer: string; type: string }) {
	return el("box", {
		style: { position: "absolute", top: 4, left: 4, right: 4, height: 5, borderStyle: "rounded", borderColor: C.yellow, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column", gap: 0 },
	},
		el("box", { style: { flexDirection: "row" } },
			el("text", { fg: C.yellow, content: "EDIT " }),
			el("text", { fg: C.fgBright, content: p.settingKey }),
			el("text", { fg: C.fgDim, content: ` (${p.type})` }),
		),
		el("box", { style: { flexDirection: "row", backgroundColor: C.inputBg, height: 1, paddingLeft: 1 } },
			el("text", { fg: C.fg, content: p.buffer }),
			el("text", { fg: C.accent, content: "█" }),
		),
		el("text", { fg: C.fgDim, content: "Enter confirm · Esc cancel" }),
	);
}

function DiffOverlay(p: { drafts: Record<string, DraftChange>; items: EffectiveSetting[] }) {
	const entries = Object.entries(p.drafts);
	const children: React.ReactNode[] = [
		el("text", { fg: C.purple, content: "Draft Diff · Apply Preview" }),
	];
	if (entries.length === 0) {
		children.push(el("text", { fg: C.fgDim, content: "  (no draft changes)" }));
	} else {
		for (const [key, change] of entries) {
			const base = p.items.find((i) => i.feature === change.feature && i.key === change.key);
			children.push(
				el("box", { key, style: { flexDirection: "column" } },
					el("box", { style: { flexDirection: "row" } },
						el("text", { fg: C.accent, content: key }),
						el("text", { fg: C.fgDim, content: ` (${change.scope})` }),
					),
					el("text", { fg: C.orange, content: `- ${valueText(base?.effectiveValue) || "(unset)"}` }),
					el("text", { fg: C.green, content: `+ ${change.raw || "(unset)"}` }),
				),
			);
		}
		children.push(el("text", { fg: C.green, content: "Press a to apply · Esc to close" }));
	}

	return el("box", {
		style: { position: "absolute", top: 3, left: 2, right: 2, bottom: 3, borderStyle: "rounded", borderColor: C.purple, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column", gap: 1 },
	}, ...children);
}

function ModelPickerOverlay(p: { models: ModelCatalogItem[]; selected: number; onSelect: (index: number) => void }) {
	const scrollRef = useRef<ScrollBoxRenderable>(null);

	useEffect(() => {
		const id = `model-row-${p.selected}`;
		scrollRef.current?.scrollChildIntoView(id);
	}, [p.selected, p.models.length]);

	const rows = p.models.map((m, i) => {
		const isSel = i === p.selected;
		return el("box", {
			key: `${m.provider}/${m.modelId}`,
			id: `model-row-${i}`,
			style: { flexDirection: "row", height: 1, backgroundColor: isSel ? C.bgSelected : C.bg, paddingLeft: 1, paddingRight: 1 },
			onMouseDown: (event: any) => { if (isLeftMouse(event)) { p.onSelect(i); event?.stopPropagation?.(); } },
		},
			el("text", { fg: isSel ? C.fgBright : C.fg, content: `${isSel ? "▸" : " "} ${pad(`${m.provider}/${m.modelId}`, 44)} ` }),
			m.reasoning ? el("text", { fg: isSel ? C.fgBright : C.teal, content: "reasoning " }) : null,
			el("text", { fg: C.fgDim, content: m.label }),
		);
	});

	return el("box", {
		style: { position: "absolute", top: 1, left: 2, right: 2, bottom: 2, borderStyle: "rounded", borderColor: C.cyan, backgroundColor: C.overlayBg, padding: 1, flexDirection: "column", gap: 0 },
	},
		el("text", { fg: C.cyan, content: "Select Model" }),
		el("text", { fg: C.fgDim, content: "↑↓ navigate · click select · wheel scroll · Enter select · Esc cancel" }),
		el("scrollbox", {
			ref: scrollRef,
			style: { width: "100%", flexGrow: 1, backgroundColor: C.bg },
			scrollY: true,
			viewportCulling: true,
		}, ...rows),
	);
}

// ─── Main App ─────────────────────────────────────────────────────

export function SettingsEditorApp({
	effective,
	diagnostics,
	models,
	onApply,
	onQuit,
}: SettingsEditorAppProps) {
	useTerminalDimensions();
	const settingsScrollRef = useRef<ScrollBoxRenderable>(null);

	const [selected, setSelected] = useState(0);
	const [scope, setScope] = useState<SettingsScope>("global");
	const [mode, setMode] = useState<AppMode>("list");
	const [buffer, setBuffer] = useState("");
	const [modelSelected, setModelSelected] = useState(0);
	const [drafts, setDrafts] = useState<Record<string, DraftChange>>({});
	const [message, setMessage] = useState("Welcome to Mekann Settings Editor");
	const [applying, setApplying] = useState(false);
	const lastSettingClickRef = useRef<{ index: number; at: number } | null>(null);

	const items = useMemo(() => effective, [effective]);
	const groups = useMemo(() => buildFeatureGroups(items), [items]);
	const current = items[Math.min(selected, Math.max(0, items.length - 1))];
	const currentDraft = current ? drafts[itemId(current)] : undefined;
	const shownValue = currentDraft?.raw ?? valueText(current?.effectiveValue);

	useEffect(() => {
		settingsScrollRef.current?.scrollChildIntoView(`setting-row-${selected}`);
	}, [selected, items.length]);

	const stage = useCallback(
		(item: EffectiveSetting, raw: string) => {
			setDrafts((d) => ({ ...d, [itemId(item)]: { feature: item.feature, key: item.key, scope, raw } }));
			setMessage(`staged ${itemId(item)} → ${scope}`);
		},
		[scope],
	);

	const shownValueFor = useCallback((item: EffectiveSetting): string => {
		return drafts[itemId(item)]?.raw ?? valueText(item.effectiveValue);
	}, [drafts]);

	const activateSetting = useCallback((item: EffectiveSetting) => {
		const shown = shownValueFor(item);
		if (item.schema.type === "modelRef") {
			setModelSelected(0); setMode("models"); setMessage("pick a model");
		} else if (item.schema.type === "enum") {
			const values = item.feature === "plan-mode" && item.key.startsWith("thinking.") ? supportedThinking(models, item, items) : (item.schema.enumValues ?? []);
			const idx = Math.max(0, values.indexOf(shown));
			stage(item, values[(idx + 1) % values.length] ?? "");
		} else if (item.schema.type === "boolean") {
			const draft = drafts[itemId(item)]?.raw;
			const cur = draft === undefined ? item.effectiveValue : /^(true|1|yes|on)$/i.test(draft);
			stage(item, String(!cur));
		} else {
			setBuffer(shown === "(unset)" ? "" : shown); setMode("edit"); setMessage(`editing ${itemId(item)}`);
		}
	}, [drafts, items, models, shownValueFor, stage]);

	const selectSettingByMouse = useCallback((index: number) => {
		const now = Date.now();
		const last = lastSettingClickRef.current;
		setSelected(index);
		if (last && last.index === index && now - last.at <= 400) {
			lastSettingClickRef.current = null;
			const item = items[index];
			if (item) activateSetting(item);
			return;
		}
		lastSettingClickRef.current = { index, at: now };
	}, [activateSetting, items]);

	// ─── Keyboard ──────────────────────────────────────────────

	useKeyboard((key) => {
		if (key.ctrl && key.name === "c") { onQuit(); return; }

		if (mode === "edit") {
			if (key.name === "escape") { setMode("list"); setMessage("edit cancelled"); return; }
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
				const m = models[modelSelected]; stage(current, `${m.provider}/${m.modelId}`); setMode("list");
			}
			return;
		}

		if (key.name === "q") { onQuit(); return; }
		if (key.name === "up") setSelected((i) => Math.max(0, i - 1));
		else if (key.name === "down") setSelected((i) => Math.min(items.length - 1, i + 1));
		else if (key.name === "tab") {
			setScope((s) => s === "global" ? "workspace" : "global");
			setMessage(`save scope → ${scope === "global" ? "workspace" : "global"}`);
		}
		else if (key.name === "d") setMode(mode === "diff" ? "list" : "diff");
		// Enter: context-sensitive action based on setting type
		else if ((key.name === "return" || key.name === "enter") && current) {
			activateSetting(current);
		} else if (key.name === "a" && !applying) {
			const changes = Object.values(drafts);
			if (changes.length === 0) { setMessage("no drafts to apply"); return; }
			setApplying(true);
			void onApply(changes).then((err) => {
				setApplying(false);
				if (err) setMessage(`✗ ${err}`);
				else { setDrafts({}); setMessage("✓ applied — restart Pi to use new settings"); }
			});
		}
	});

	// ─── Build setting rows with group headers ─────────────────

	const rows: React.ReactNode[] = [];
	for (let gi = 0; gi < groups.length; gi++) {
		const group = groups[gi];
		rows.push(el(FeatureHeader, { feature: group.feature, key: `h-${group.feature}` }));
		if (gi === 0) rows.push(el(ColumnHeader, { key: "col-header" }));
		for (let j = 0; j < group.items.length; j++) {
			const i = group.startIndex + j;
			const item = group.items[j];
			const draft = drafts[itemId(item)];
			rows.push(el(SettingRow, {
				key: itemId(item),
				item, index: i,
				isSelected: i === selected,
				hasDraft: !!draft,
				draftValue: draft?.raw ?? "",
				draftScope: draft?.scope ?? "",
				onSelect: selectSettingByMouse,
			}));
		}
	}

	// ─── Render ────────────────────────────────────────────────

	return el("box", {
		style: { flexDirection: "row", width: "100%", height: "100%", backgroundColor: C.bg },
	},
		// Left panel: Settings list
		el("box", { style: { width: "65%", height: "100%", flexDirection: "column", paddingBottom: 2 } },
			el("box", { style: { width: "100%", height: 1, backgroundColor: C.titleBarBg, flexDirection: "row", paddingLeft: 1, paddingRight: 1, alignItems: "center" } },
				el("text", { fg: C.fgBright, content: " Mekann Settings" }),
				el("box", { style: { flexGrow: 1 } }),
				el("text", { fg: C.fgDim, content: `${items.length} settings · ${models.length} models` }),
			),
			el("scrollbox", {
				ref: settingsScrollRef,
				style: { width: "100%", flexGrow: 1, backgroundColor: C.bg },
				scrollY: true,
				viewportCulling: true,
				focused: true,
			}, ...rows),
		),
		// Right panel: Detail
		el("box", { style: { width: "35%", height: "100%", flexDirection: "column", paddingBottom: 2, paddingRight: 1 } },
			el("box", { style: { width: "100%", height: 1, backgroundColor: C.groupHeaderBg, flexDirection: "row", paddingLeft: 1, alignItems: "center" } },
				el("text", { fg: C.fgBright, content: " Detail" }),
			),
			el(DetailPanel, { item: current, draft: currentDraft, models, allItems: items, scope }),
		),
		// Status bar
		el(StatusBar, { message, scope, draftCount: Object.keys(drafts).length, diagnosticsCount: diagnostics.length, mode, currentType: current?.schema.type ?? "" }),
		// Overlays
		...(mode === "edit" && current ? [el(EditOverlay, { settingKey: itemId(current), buffer, type: current.schema.type })] : []),
		...(mode === "diff" ? [el(DiffOverlay, { drafts, items })] : []),
		...(mode === "models" ? [el(ModelPickerOverlay, { models, selected: modelSelected, onSelect: setModelSelected })] : []),
	);
}
