/**
 * SSE parser for Codex Responses API streaming.
 *
 * Parses a ReadableStream<Uint8Array> into typed SSE events.
 */

interface SseEvent {
	type: string;
	data?: unknown;
	raw?: string;
}

export async function* parseSse(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let separatorIndex = buffer.indexOf("\n\n");
		while (separatorIndex !== -1) {
			const frame = buffer.slice(0, separatorIndex);
			buffer = buffer.slice(separatorIndex + 2);
			const event = parseSseFrame(frame);
			if (event) yield event;
			separatorIndex = buffer.indexOf("\n\n");
		}
	}

	buffer += decoder.decode();
	const event = parseSseFrame(buffer);
	if (event) yield event;
}

function parseSseFrame(frame: string): SseEvent | undefined {
	const lines = frame.split(/\r?\n/);
	let type = "";
	const dataLines: string[] = [];

	for (const line of lines) {
		if (line.startsWith("event:")) {
			type = line.slice("event:".length).trim();
		} else if (line.startsWith("data:")) {
			dataLines.push(line.slice("data:".length).trimStart());
		}
	}

	if (dataLines.length === 0) return undefined;
	const raw = dataLines.join("\n");
	if (raw === "[DONE]") return undefined;

	try {
		return { type, data: JSON.parse(raw) };
	} catch {
		return { type, raw };
	}
}
