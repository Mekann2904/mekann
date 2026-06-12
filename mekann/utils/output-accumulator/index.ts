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
    const firstNl = this.tailText.indexOf("\n");
    return firstNl === -1 ? this.tailText : this.tailText.slice(firstNl + 1);
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

    // Find a line boundary near the target cut point
    // Estimate char position from byte position (UTF-8 safe: chars <= bytes)
    const targetBytes = this.tailText.length - Math.floor(this.maxBytes * 0.8);
    // Scan for next newline from estimated position
    let cutCharPos = Math.max(0, Math.min(targetBytes, this.tailText.length - 1));

    // Find the next newline after cutCharPos to ensure line boundary
    const nlPos = this.tailText.indexOf("\n", cutCharPos);
    if (nlPos !== -1 && nlPos < this.tailText.length - 1) {
      cutCharPos = nlPos + 1;
    } else {
      // No newline found after estimated position; keep last portion as-is
      cutCharPos = Math.max(0, this.tailText.length - Math.floor(this.maxBytes * 0.5));
      // Still try to find a line boundary
      const fallbackNl = this.tailText.indexOf("\n", cutCharPos);
      if (fallbackNl !== -1 && fallbackNl < this.tailText.length - 1) {
        cutCharPos = fallbackNl + 1;
      }
    }

    this.lineBoundary = true;
    this.tailText = this.tailText.slice(cutCharPos);
    this.tailBytes = byteLength(this.tailText);
  }
}
