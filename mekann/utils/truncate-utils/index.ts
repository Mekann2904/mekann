/**
 * Scan-based truncateTail/truncateHead.
 *
 * Replaces split("\n") full-line array allocation with direct string
 * scanning using lastIndexOf/indexOf, avoiding O(n) intermediate arrays.
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
  let startPos = lineEnds[0];

  // Check byte limit
  let truncatedBy: "lines" | "bytes" = "lines";
  const candidateBytes = Buffer.byteLength(content.slice(startPos), "utf-8");
  if (candidateBytes > maxBytes) {
    truncatedBy = "bytes";
    // Take the end of content within byte limit
    startPos = findByteBoundaryFromEnd(content, maxBytes);
  }

  const resultContent = content.slice(startPos);
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
    resultContent = truncateStringToBytesFromStart(resultContent, maxBytes);
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
 * Find a byte-aligned start position from the end of a string,
 * ensuring we don't split a multi-byte UTF-8 character.
 */
function findByteBoundaryFromEnd(content: string, maxBytes: number): number {
  // Estimate character position (chars <= bytes for UTF-8)
  let charPos = content.length;
  // Walk backwards until byte length fits
  while (charPos > 0 && Buffer.byteLength(content.slice(charPos), "utf-8") === 0) {
    charPos--;
  }
  // Binary search for the right position
  let lo = 0;
  let hi = content.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const bytes = Buffer.byteLength(content.slice(mid), "utf-8");
    if (bytes > maxBytes) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // Ensure we don't start mid-character (advance past any leading continuation bytes)
  // Since we're slicing from `lo`, and UTF-8 continuation bytes are 0x80-0xBF,
  // we need to make sure `lo` is at a character boundary.
  // For safety, find the next newline after lo
  const nlPos = content.indexOf("\n", lo);
  if (nlPos !== -1 && nlPos < content.length - 1) {
    return nlPos + 1;
  }
  return lo;
}

function truncateStringToBytesFromStart(str: string, maxBytes: number): string {
  const buf = Buffer.from(str, "utf-8");
  if (buf.length <= maxBytes) return str;
  let end = maxBytes;
  while (end < buf.length && (buf[end] & 0xc0) === 0x80) end++;
  return buf.slice(0, end).toString("utf-8");
}
