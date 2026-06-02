import { parseMetricLines } from "./state.js";

export interface ExternalInfo {
	externalRunId: string | null;
	externalArtifactDir: string | null;
	externalSummaryPath: string | null;
	externalViewlogPath: string | null;
	externalMetricsPath: string | null;
}

export interface StreamingParseState extends ExternalInfo {
	metrics: Record<string, number>;
	stdoutBuf: string;
	stderrBuf: string;
}

export function emptyExternalInfo(): ExternalInfo {
	return {
		externalRunId: null,
		externalArtifactDir: null,
		externalSummaryPath: null,
		externalViewlogPath: null,
		externalMetricsPath: null,
	};
}

export function parseExternalInfo(output: string): ExternalInfo {
	const info = emptyExternalInfo();

	for (const line of output.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const match = trimmed.match(/^(RUN_ID|ARTIFACT_DIR|SUMMARY_PATH|VIEWLOG_PATH|METRICS_PATH)\s+(.+)$/);
		if (!match) continue;

		assignExternalInfo(info, match[1], match[2]);
	}

	return info;
}

export function createStreamingParseState(): StreamingParseState {
	return {
		...emptyExternalInfo(),
		metrics: {},
		stdoutBuf: "",
		stderrBuf: "",
	};
}

export function parseStreamingLine(state: StreamingParseState, line: string): void {
	const text = line.trim();
	if (text.startsWith("METRIC ") || text.startsWith("METRIC:")) {
		const rest = text.startsWith("METRIC: ") ? text.slice(8) : text.slice(7);
		const eq = rest.indexOf("=");
		if (eq >= 0) {
			const name = rest.slice(0, eq).trim();
			const value = Number(rest.slice(eq + 1).trim());
			if (name && !Number.isNaN(value)) state.metrics[name] = value;
		}
	}

	const match = text.match(/^(RUN_ID|ARTIFACT_DIR|SUMMARY_PATH|VIEWLOG_PATH|METRICS_PATH)\s+(.+)$/);
	if (match) assignExternalInfo(state, match[1], match[2]);
}

export function parseStreamingChunk(state: StreamingParseState, chunk: string, bufferKey: "stdoutBuf" | "stderrBuf"): void {
	state[bufferKey] += chunk;
	const lines = state[bufferKey].split("\n");
	state[bufferKey] = lines.pop() ?? "";
	for (const line of lines) parseStreamingLine(state, line);
}

export function finalizeParsedRunOutput(state: StreamingParseState, stdout: string, stderr: string): { parsedMetrics: Record<string, number>; externalInfo: ExternalInfo } {
	if (state.stdoutBuf) parseStreamingLine(state, state.stdoutBuf);
	if (state.stderrBuf) parseStreamingLine(state, state.stderrBuf);

	const combined = stdout + (stderr ? "\n" + stderr : "");
	const inMemoryMetrics = parseMetricLines(combined);
	const inMemoryExternal = parseExternalInfo(stdout);

	return {
		parsedMetrics: { ...inMemoryMetrics, ...state.metrics },
		externalInfo: {
			externalRunId: state.externalRunId ?? inMemoryExternal.externalRunId,
			externalArtifactDir: state.externalArtifactDir ?? inMemoryExternal.externalArtifactDir,
			externalSummaryPath: state.externalSummaryPath ?? inMemoryExternal.externalSummaryPath,
			externalViewlogPath: state.externalViewlogPath ?? inMemoryExternal.externalViewlogPath,
			externalMetricsPath: state.externalMetricsPath ?? inMemoryExternal.externalMetricsPath,
		},
	};
}

function assignExternalInfo(target: ExternalInfo, key: string, rawValue: string): void {
	const value = rawValue.trim();
	switch (key) {
		case "RUN_ID": target.externalRunId = value; break;
		case "ARTIFACT_DIR": target.externalArtifactDir = value; break;
		case "SUMMARY_PATH": target.externalSummaryPath = value; break;
		case "VIEWLOG_PATH": target.externalViewlogPath = value; break;
		case "METRICS_PATH": target.externalMetricsPath = value; break;
	}
}
