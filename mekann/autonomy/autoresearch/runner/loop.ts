/**
 * autoresearch/runner/loop.ts — ループ継続判定と follow-up メッセージ。
 *
 * COMPLETE marker の検出 (ネストした event オブジェクトから text/content/messages を
 * 再帰的に拾う) と、次イテレーションを促す follow-up メッセージ生成。
 * 他の runner モジュールに依存しない leaf。
 */

// ---------------------------------------------------------------------------
// Loop helpers
// ---------------------------------------------------------------------------

export const COMPLETE_MARKER = "<autoresearch>COMPLETE</autoresearch>";

function appendTextFragments(value: unknown, out: string[]): void {
	if (typeof value === "string") { out.push(value); return; }
	if (!value || typeof value !== "object") return;
	if (Array.isArray(value)) { for (const item of value) appendTextFragments(item, out); return; }
	const record = value as Record<string, unknown>;
	if (typeof record.text === "string") out.push(record.text);
	if (typeof record.content === "string") out.push(record.content);
	if (Array.isArray(record.content)) appendTextFragments(record.content, out);
	if (Array.isArray(record.messages)) appendTextFragments(record.messages, out);
}

export function hasCompleteMarker(event: unknown): boolean {
	const fragments: string[] = [];
	appendTextFragments(event, fragments);
	return fragments.join("\n").includes(COMPLETE_MARKER);
}

export function loopFollowUpMessage(noProgress: boolean): string {
	const prefix = noProgress
		? "前ターンでは autoresearch_log まで進みませんでした。"
		: "前ターンの実験記録が完了しました。";
	return [
		prefix,
		"Ralph 方式で次のイテレーションを継続してください。",
		"- まず autoresearch の dynamic context / state / current.plan / contract / journal を確認し、現在の目的・指標・進捗・未探索領域を把握する",
		"- autoresearch.md と autoresearch.ideas.md（存在する場合）を読み、過去の学びを踏まえる",
		"- 前回結果から「次に何を試すべきか」を明示してから実験する",
		"- 原則として1ターンで1つの具体的な実験だけを行う",
		"- コード変更後は autoresearch_run → autoresearch_log を必ず実行する",
		"- subagent が利用可能なら、書き込みを伴わないコード調査・ログ要約・失敗原因分析・次実験案の探索に積極的に使う",
		"- subagent にはファイル編集、autoresearch_run / autoresearch_log、git操作を任せない。実験実行と記録は root が行う",
		"- subagent の結果は参考情報として統合し、実際に試す実験は1ターンにつき1つだけにする",
		"- 学んだことを autoresearch.md の Codebase Patterns / 試したこと、または memo に残す",
		"- 改善余地・未検証候補・不確実性が残る場合は継続する",
		"- COMPLETE を返す前に、未探索候補がないことを journal / autoresearch.md に記録して確認する",
		`- 有望な実験が尽きた場合だけ ${COMPLETE_MARKER} を返す`, 
		"ユーザーに継続確認せず進めてください。",
	].join("\n");
}
