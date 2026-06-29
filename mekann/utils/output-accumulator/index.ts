/**
 * RollingTextBuffer — string-based rolling buffer that avoids Buffer.from round-trips.
 *
 * Replaces the OutputAccumulator.trimTail() pattern of
 * Buffer.from(text) → subarray → toString("utf-8") with direct
 * string operations (indexOf, slice) on line boundaries.
 */

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf-8");
}

/**
 * Trim `text` from the front so the result fits within `maxBytes` UTF-8 bytes,
 * preferring to start on a line boundary. Returns the kept text and whether it
 * starts on a line boundary. When no line boundary fits within maxBytes (e.g.
 * a single very long line), falls back to a byte-safe tail cut and reports
 * `lineBoundary: false` so callers can lazily realign to the next newline.
 *
 * This is byte-accurate: CJK characters are 3 bytes each in UTF-8, so the old
 * char-based estimate ("chars <= bytes") silently over-retained ~2.4x.
 */
function trimTextToByteBudget(text: string, maxBytes: number): { text: string; lineBoundary: boolean } {
  const total = byteLength(text);
  if (total <= maxBytes) return { text, lineBoundary: true };

  // Walk forward through line starts; the first one whose remaining tail fits
  // keeps the most content while respecting the byte budget. Track running
  // bytes incrementally to avoid recomputing the whole tail each step.
  let idx = 0;
  let running = total;
  while (idx < text.length) {
    if (running <= maxBytes) {
      return { text: text.slice(idx), lineBoundary: true };
    }
    const nl = text.indexOf("\n", idx);
    if (nl === -1) break;
    const next = nl + 1;
    running -= byteLength(text.slice(idx, next));
    idx = next;
  }

  // No line boundary fits within maxBytes: byte-safe tail cut (robust for
  // CJK / emoji); mark not-at-boundary so getText() realigns to a newline.
  const buf = Buffer.from(text, "utf-8");
  let start = Math.max(0, buf.byteLength - maxBytes);
  while (start < buf.byteLength && (buf[start] & 0xc0) === 0x80) start++;
  return { text: buf.subarray(start).toString("utf-8"), lineBoundary: false };
}

export interface RollingTextBufferOptions {
  maxBytes: number;
}

export class RollingTextBuffer {
  private maxBytes: number;
  private tailText = "";
  private tailBytes = 0;
  private lineBoundary = true;

  constructor(options: RollingTextBufferOptions) {
    this.maxBytes = options.maxBytes;
  }

  append(text: string): void {
    if (text.length === 0) return;
    this.tailText += text;
    this.tailBytes += byteLength(text);
    if (this.tailBytes > this.maxBytes * 2) {
      this.trimTail();
    }
  }

  getText(): string {
    if (this.lineBoundary) return this.tailText;
    // tailText may start mid-line after a byte-safe fallback trim. Realign to the
    // next line boundary when it yields content; otherwise return as-is so we
    // never produce an empty read when there is recent content to show.
    const firstNl = this.tailText.indexOf("\n");
    if (firstNl === -1 || firstNl >= this.tailText.length - 1) return this.tailText;
    return this.tailText.slice(firstNl + 1);
  }

  getByteLength(): number {
    return this.tailBytes;
  }

  startsAtLineBoundary(): boolean {
    return this.lineBoundary;
  }

  private trimTail(): void {
    if (this.tailBytes <= this.maxBytes) {
      return;
    }
    // Byte-accurate trim: keep the most recent content that fits within
    // maxBytes (measured in UTF-8 bytes), preferring to start on a line
    // boundary. Replaces the old char-based estimate that over-retained CJK.
    const { text, lineBoundary } = trimTextToByteBudget(this.tailText, this.maxBytes);
    this.tailText = text;
    this.tailBytes = byteLength(this.tailText);
    this.lineBoundary = lineBoundary;
  }
}
