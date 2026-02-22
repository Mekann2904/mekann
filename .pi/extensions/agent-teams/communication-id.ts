/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-id.ts
 * role: 安全なコミュニケーション用ID生成
 * why: memberIdが特殊文字を含む場合でも参照トークンを安全に生成するため
 * related: .pi/extensions/agent-teams/communication.ts, communication-links.ts
 * public_api: CommIdEntry, generateCommId, resolveUniqueCommIds
 * invariants: 同じmemberIdからは同じcommIdが生成される、同一チーム内でcommIdは一意
 * side_effects: なし
 * failure_modes: なし
 */

const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const DEFAULT_COMM_ID_LENGTH = 8;
const MAX_COMM_ID_LENGTH = 16;

/**
 * 通信IDエントリ
 * @summary IDマッピング
 */
export interface CommIdEntry {
  memberId: string;
  commId: string;
}

export function isSafeId(id: string): boolean {
  return SAFE_ID_PATTERN.test(id);
}

/**
 * 通信用IDを生成する
 * @summary 安全な通信ID生成
 * @param memberId メンバーID
 * @param salt ソルト値（オプション）
 * @returns 通信用ID
 */
export function generateCommId(memberId: string, salt = ""): string {
  if (SAFE_ID_PATTERN.test(memberId)) {
    return memberId;
  }

  const hash = createStableHash(`${memberId}:${salt}`);
  return base32Encode(hash).slice(0, DEFAULT_COMM_ID_LENGTH);
}

/**
 * メンバーから一意な通信IDを解決する
 * @summary 一意通信ID解決
 * @param members メンバーリスト
 * @param salt ソルト値（オプション）
 * @returns 通信IDエントリの配列
 */
export function resolveUniqueCommIds(
  members: { id: string }[],
  salt = ""
): CommIdEntry[] {
  const entries: CommIdEntry[] = [];
  const usedCommIds = new Set<string>();

  for (const member of members) {
    let commId = generateCommId(member.id, salt);
    let length = DEFAULT_COMM_ID_LENGTH;
    let attempts = 0;

    while (usedCommIds.has(commId)) {
      attempts++;
      length = Math.min(length + 4, MAX_COMM_ID_LENGTH);
      commId = generateCommId(member.id, `${salt}:${length}:${attempts}`);
    }

    usedCommIds.add(commId);
    entries.push({ memberId: member.id, commId });
  }

  return entries;
}

export function createCommIdMaps(entries: CommIdEntry[]): {
  memberIdToCommId: Map<string, string>;
  commIdToMemberId: Map<string, string>;
} {
  return {
    memberIdToCommId: new Map(entries.map(e => [e.memberId, e.commId])),
    commIdToMemberId: new Map(entries.map(e => [e.commId, e.memberId])),
  };
}

function createStableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = xorshift32(h);
  }
  return h >>> 0;
}

function xorshift32(x: number): number {
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function base32Encode(n: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz234567";
  let result = "";
  let value = n;
  for (let i = 0; i < 8; i++) {
    result += chars[value & 31];
    value >>>= 5;
  }
  return result;
}

export function stringToSeed(input: string): number {
  return createStableHash(input);
}

export function combineSeed(base: number, memberId: string, round: number): number {
  let h = base ^ round;
  for (let i = 0; i < memberId.length; i++) {
    h ^= memberId.charCodeAt(i) << ((i % 16));
  }
  return xorshift32(h) >>> 0;
}
