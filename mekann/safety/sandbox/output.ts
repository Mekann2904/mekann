import { MEKANN_OUTPUT_GATE_DEFAULTS } from "../../config.js";
import { featureRawConfig } from "../../settings/enabled.js";
import { gateTextForLlm, redactSecrets } from "../../context/tool-output/index.js";
import { truncateForLlm } from "./truncation.js";

export interface SandboxOutputFormattingResult {
	shown: ReturnType<typeof truncateForLlm>;
	outputGate?: {
		stored: boolean;
		bytes: number;
		lines: number;
		redacted: true;
		artifactId?: string;
		sha256?: string;
		storageError?: string;
		formattingError?: string;
	};
}

export async function formatSandboxedBashOutputForLlm(input: {
	cwd: string;
	command: string;
	output: string;
}): Promise<SandboxOutputFormattingResult> {
	try {
		const gated = await gateTextForLlm({
			cwd: input.cwd,
			toolName: "bash",
			text: input.output,
			source: { kind: "sandboxed_bash", command: redactSecrets(input.command).text.slice(0, 2000) },
			maxInlineBytes: Number(featureRawConfig("output-gate").maxInlineBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.maxInlineBytes,
			previewBytes: Number(featureRawConfig("output-gate").previewBytes) || MEKANN_OUTPUT_GATE_DEFAULTS.previewBytes,
		});
		const shown = gated.handled ? {
			text: gated.text,
			truncated: true,
			originalBytes: gated.originalBytes,
			originalLines: gated.originalLines,
		} : truncateForLlm(input.output);
		const outputGate = gated.handled ? (gated.gated ? {
			stored: true,
			artifactId: gated.artifactId,
			bytes: gated.originalBytes,
			lines: gated.originalLines,
			sha256: gated.sha256,
			redacted: true as const,
		} : {
			stored: false,
			bytes: gated.originalBytes,
			lines: gated.originalLines,
			redacted: true as const,
			storageError: gated.storageError,
		}) : undefined;
		return { shown, outputGate };
	} catch (error) {
		const shown = truncateForLlm(input.output);
		return {
			shown,
			outputGate: {
				stored: false,
				bytes: shown.originalBytes,
				lines: shown.originalLines,
				redacted: true,
				formattingError: error instanceof Error ? error.message : String(error),
			},
		};
	}
}
