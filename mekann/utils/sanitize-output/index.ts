/**
 * Optimized sanitizeBinaryOutput using regex-based replacement.
 *
 * Replaces Array.from(str).filter().join("") pattern with a single
 * regex pass, eliminating per-character string allocations.
 *
 * Removes:
 * - Control characters 0x00-0x08, 0x0B-0x0C, 0x0E-0x1F
 *   (keeps TAB=0x09, LF=0x0A, CR=0x0D)
 * - Unicode Format characters U+FFF9-U+FFFB
 */
export function sanitizeBinaryOutput(str: string): string {
  return str.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\u{fff9}-\u{fffb}]/gu, "");
}
