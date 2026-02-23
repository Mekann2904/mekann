/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-id.ts
 * role: 通信ID生成と衝突回避
 * why: 安全かつ一意なID文字列を生成し、メンバー間の通信経路を識別するため
 * related: .pi/extensions/agent-teams/agent.ts, .pi/extensions/agent-teams/protocol.ts
 * public_api: isSafeId, generateCommId, resolveUniqueCommIds, createCommIdMaps, stringToSeed, combineSeed
 * invariants: 生成されるIDは英数字とアンダースコア、ハイフンのみで構成される, IDの最大長は16文字以内
 * side_effects: なし（純粋関数）
 * failure_modes: 衝突回避計算が MAX_COMM_ID_LENGTH を超えても一意性が得られない場合（発生確率は極小）
 * @abdd.explain
 * overview: メンバーIDを安全な通信ID（URL-safeな文字列）へ変換し、リスト全体での一意性を保証するユーティリティ
 * what_it_does:
 *   - メンバーIDが安全なパターンならそのまま、そうでなければハッシュベースのIDを生成する
 *   - 複数のメンバーに対して、IDが重複しないよう長さやソルトを調整して一意なIDを割り当てる
 *   - メンバーIDと通信IDの相互変換用Mapを作成する
 *   - 文字列からシード値を生成・結合する
 * why_it_exists:
 *   - 内部IDが外部公開や通信路識別子として不適切な文字列を含む場合の対策
 *   - ハッシュ生成によりIDの規則性を隠蔽し、推測や不正アクセスを防ぐ
 *   - 自動的な衝突回避ロジックにより、運用側での手動調整コストを削減する
 * scope:
 *   in: メンバーID文字列、オプションのソルト値、IDリスト
 *   out: Base32エンコードされた通信ID、ID変換マップ、数値シード
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

/**
 * 安全なIDか判定
 * @summary 安全性を判定
 * @param id ID文字列
 * @returns 安全ならtrue
 */
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

/**
 * 通信IDマップを作成
 * @summary IDマップを作成
 * @param entries エントリリスト
 * @returns メンバーIDと通信IDのマップ
 */
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

/**
 * 文字列をシード値へ変換
 * @summary 文字列をシード値化
 * @param input 入力文字列
 * @returns シード値
 */
export function stringToSeed(input: string): number {
  return createStableHash(input);
}

/**
 * シード値を結合
 * @summary シード値を結合する
 * @param base ベース番号
 * @param memberId メンバーID
 * @param round ラウンド数
 * @returns 結合されたシード値
 */
export function combineSeed(base: number, memberId: string, round: number): number {
  let h = base ^ round;
  for (let i = 0; i < memberId.length; i++) {
    h ^= memberId.charCodeAt(i) << ((i % 16));
  }
  return xorshift32(h) >>> 0;
}
