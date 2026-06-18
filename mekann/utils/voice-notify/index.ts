import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { registerPromptProvider } from "../../core/prompt-core/index.js";

const VOICE_SYSTEM_PROMPT = `
## Voice notification

When you want to notify the user by voice (e.g. task completed, waiting for input, important result), wrap the spoken text in <voice> tags. The content inside the tags will be read aloud via text-to-speech; the tags themselves remain visible in your displayed response.

Guidelines:
- Use <voice> proactively for user-facing notifications, especially when a task is complete, user input is needed, or an important result is ready.
- Keep voice messages short and concise (1–2 sentences).
- Use the user's language inside <voice> tags.
- You may include multiple <voice> blocks; they will be concatenated.
- Do NOT use <voice> for intermediate thinking or tool-use narration, routine progress narration, or tool-use narration.
- **Always** include a <voice> notification when finishing a long-running task such as a review, audit, or any multi-step workflow that involved significant tool use. The user may be away from the terminal and relies on the voice alert to know the task has completed.

Example:
<voice>リファクタリングが完了しました。レビューをお願いします。</voice>
`;

const VOICE_TAG_RE = /<voice>([\s\S]*?)<\/voice>/g;

function isEnabled(): boolean {
	return process.env.VOICE_NOTIFY_ENABLED !== "false";
}

function extractVoiceContent(text: string): string {
	const parts: string[] = [];
	let match: RegExpExecArray | null;
	const re = new RegExp(VOICE_TAG_RE.source, VOICE_TAG_RE.flags);

	while ((match = re.exec(text)) !== null) {
		parts.push(match[1].trim());
	}

	return parts.filter(Boolean).join("。");
}

function assistantText(message: any): string {
	return Array.isArray(message.content)
		? message.content
			.filter((block: any) => block.type === "text")
			.map((block: any) => block.text)
			.join("")
		: typeof message.content === "string"
			? message.content
			: "";
}

export default function voiceNotifyExtension(pi: ExtensionAPI): void {
	registerPromptProvider({
		id: "voice-notify",
		getFragments() {
			return [{
				id: "voice-notify:system-prompt",
				source: "voice-notify",
				kind: "coding_guidelines",
				stability: "stable",
				scope: "global",
				priority: 120,
				version: "v1",
				cacheIntent: "prefer_cache",
				content: VOICE_SYSTEM_PROMPT,
			}];
		},
	});

	// Speak as soon as an assistant message containing <voice> completes, rather
	// than waiting until the whole agent turn ends. Utterances flow through a
	// serial queue so overlapping `say` processes never garble the audio.
	const speechQueue: string[] = [];
	let isSpeaking = false;

	function drainSpeechQueue(): void {
		if (isSpeaking) return;
		const next = speechQueue.shift();
		if (!next) return;
		isSpeaking = true;
		const child = execFile("say", [next], (error) => {
			isSpeaking = false;
			if (error) {
				process.stderr.write(`[voice-notify] say failed: ${error.message}\n`);
			}
			drainSpeechQueue();
		});
		child.unref();
	}

	function enqueueSpeech(text: string): void {
		speechQueue.push(text);
		drainSpeechQueue();
	}

	pi.on("message_end", async (event) => {
		if (!isEnabled()) return;
		if (event.message.role !== "assistant") return;

		const content = extractVoiceContent(assistantText(event.message));
		if (content) enqueueSpeech(content);
	});
}
