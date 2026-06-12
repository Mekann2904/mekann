/**
 * Shared confirmation helper for destructive context-suite maintenance commands.
 *
 * Kept outside individual features so output-gate and context-ledger do not
 * import each other's entrypoints just to reuse command UI behaviour.
 */
export async function handleClear(ctx: any, label: string, dir: string, clearFn: () => Promise<void>): Promise<void> {
	const confirmFn = ctx?.ui?.confirm;
	if (typeof confirmFn !== "function") {
		ctx?.ui?.notify?.("clear requires interactive confirmation", "warning");
		return;
	}
	const ok = await confirmFn(`Clear ${label}?`, `Delete ${dir} ?`);
	if (!ok) return;
	await clearFn();
	ctx?.ui?.notify?.(`${label} cleared`, "info");
}
