/**
 * Scan-based truncateTail/truncateHead plus byte-safe UTF-8 cut helpers.
 *
 * Replaces split("\n") full-line array allocation with direct string
 * scanning using lastIndexOf/indexOf, avoiding O(n) intermediate arrays.
 *
 * `truncateToBytesFromStart` / `truncateToBytesFromEnd` operate at the UTF-8
 * byte level so they are robust for CJK (3 bytes/char) and emoji / surrogate
 * pairs (4 bytes/char): results never contain a stray U+FFFD and always
 * satisfy `Buffer.byteLength(result) <= maxBytes`.
 */

export interface TruncateOptions {
  maxLines: number;
  maxBytes: number;
}

export interface TruncateResult {
  content: string;
  truncated: boolean;
  truncatedBy: "lines" | "bytes" | null;
  totalLines: number;
  totalBytes: number;
  outputLines: number;
  outputBytes: number;
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  let count = 0;
  let pos = -1;
  while ((pos = content.indexOf("\n", pos + 1)) !== -1) count++;
  // If content doesn't end with \n, last line is not counted by the loop
  if (!content.endsWith("\n")) count++;
  return count;
}

/**
 * Truncate from the tail — keep last N lines/bytes.
 * Uses lastIndexOf scanning instead of split("\n").
 */
export function truncateTail(content: string, options: TruncateOptions): TruncateResult {
  const { maxLines, maxBytes } = options;
  const totalBytes = Buffer.byteLength(content, "utf-8");
  const totalLines = countLines(content);

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
    };
  }

  // Scan backwards for line boundaries
  const lineEnds: number[] = []; // positions after each \n
  let pos = content.length;
  for (let i = 0; i < maxLines; i++) {
    const nlPos = content.lastIndexOf("\n", pos - 1);
    if (nlPos === -1) {
      // No more newlines; the start of content is the beginning of this line
      lineEnds.unshift(0);
      break;
    }
    // The line starts after the \n
    const lineStart = nlPos + 1;
    lineEnds.unshift(lineStart);
    pos = nlPos;
  }

  // Find the start position: last entry in lineEnds
  const startPos = lineEnds[0];

  let resultContent = content.slice(startPos);
  let truncatedBy: "lines" | "bytes" = "lines";

  // Check byte limit
  if (Buffer.byteLength(resultContent, "utf-8") > maxBytes) {
    truncatedBy = "bytes";
    // Byte-safe tail (robust for CJK/emoji), then snap to the first following
    // newline so the result still starts on a line boundary when possible. The
    // snap only removes content, so the result stays within maxBytes.
    const byteTail = truncateToBytesFromEnd(content, maxBytes);
    const nl = byteTail.indexOf("\n");
    resultContent = nl !== -1 && nl < byteTail.length - 1 ? byteTail.slice(nl + 1) : byteTail;
  }
  const outputBytes = Buffer.byteLength(resultContent, "utf-8");
  const outputLines = countLines(resultContent);

  return {
    content: resultContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines,
    outputBytes,
  };
}

/**
 * Truncate from the head — keep first N lines/bytes.
 * Uses indexOf scanning instead of split("\n").
 */
export function truncateHead(content: string, options: TruncateOptions): TruncateResult {
  const { maxLines, maxBytes } = options;
  const totalBytes = Buffer.byteLength(content, "utf-8");
  const totalLines = countLines(content);

  if (totalLines <= maxLines && totalBytes <= maxBytes) {
    return {
      content,
      truncated: false,
      truncatedBy: null,
      totalLines,
      totalBytes,
      outputLines: totalLines,
      outputBytes: totalBytes,
    };
  }

  // Keep the first `maxLines` lines by cutting at the newline that ends line maxLines.
  let lineStart = 0;
  let searchPos = 0;
  for (let i = 0; i < maxLines; i++) {
    const nlPos = content.indexOf("\n", searchPos);
    if (nlPos === -1) {
      // No more newlines; the rest is the last line, keep it all
      lineStart = content.length;
      break;
    }
    searchPos = nlPos + 1;
    if (i === maxLines - 1) {
      // Cut at the \n that ends line maxLines (don't include it)
      lineStart = nlPos;
    }
  }

  let resultContent = content.slice(0, lineStart);
  let truncatedBy: "lines" | "bytes" = "lines";

  // Check byte limit
  if (Buffer.byteLength(resultContent, "utf-8") > maxBytes) {
    truncatedBy = "bytes";
    resultContent = truncateToBytesFromStart(resultContent, maxBytes);
  }

  const outputBytes = Buffer.byteLength(resultContent, "utf-8");
  const outputLines = countLines(resultContent);

  return {
    content: resultContent,
    truncated: true,
    truncatedBy,
    totalLines,
    totalBytes,
    outputLines,
    outputBytes,
  };
}

/**
 * Largest suffix of `text` whose UTF-8 byte length is <= maxBytes, never
 * starting mid-character. Operates at the UTF-8 byte level so it is robust for
 * CJK (3 bytes/char) and emoji / surrogate pairs (4 bytes/char): the result
 * never contains a stray U+FFFD and always satisfies
 * `Buffer.byteLength(result) <= maxBytes`.
 */
export function truncateToBytesFromEnd(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf-8");
  if (buf.byteLength <= maxBytes) return text;
  // Keep the last maxBytes bytes, advancing past any UTF-8 continuation bytes
  // (0x80-0xBF) at the front so the suffix begins on a lead byte.
  let start = Math.max(0, buf.byteLength - maxBytes);
  while (start < buf.byteLength && (buf[start] & 0xc0) === 0x80) start++;
  return buf.subarray(start).toString("utf-8");
}

/**
 * Largest prefix of `text` whose UTF-8 byte length is <= maxBytes, never ending
 * mid-character. Byte-level and robust for CJK / emoji; the result always
 * satisfies `Buffer.byteLength(result) <= maxBytes`.
 */
export function truncateToBytesFromStart(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf-8");
  if (buf.byteLength <= maxBytes) return text;
  // Cut at maxBytes, then back up over a partial multi-byte character so we end
  // on a character boundary (the partial char is excluded entirely).
  let end = Math.min(maxBytes, buf.byteLength);
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf-8");
}

/**
 * Canonical byte-safe UTF-8 slice used across the codebase (output-gate store,
 * sandbox truncation, structured preview, ...). Returns the largest prefix
 * (`fromEnd = false`, default) or suffix (`fromEnd = true`) of `text` whose
 * UTF-8 byte length is <= `maxBytes`, never cutting mid-character.
 *
 * Robust for CJK (3 bytes/char) and emoji / surrogate pairs (4 bytes/char):
 * the result never contains a stray U+FFFD and always satisfies
 * `Buffer.byteLength(result) <= maxBytes`. `maxBytes <= 0` yields `""`.
 *
 * Backs the historical `safeUtf8Slice` reference in `output-gate/store.ts`; it
 * delegates to the efficient `truncateToBytesFrom*` (continuation-byte scan)
 * instead of re-decoding per step, so it is O(boundary) rather than O(n).
 */
export function safeUtf8Slice(text: string, maxBytes: number, fromEnd = false): string {
  if (maxBytes <= 0) return "";
  return fromEnd ? truncateToBytesFromEnd(text, maxBytes) : truncateToBytesFromStart(text, maxBytes);
}
