/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-links.ts
 * role: チームメンバー間の通信リンク管理（決定論的ローテーション）
 * why: 再現可能で公平なパートナー選択を実現するため
 * related: .pi/extensions/agent-teams/communication.ts, communication-id.ts
 * public_api: CommunicationLinksOptions, createCommunicationLinksMap, deterministicShuffle
 * invariants: 同一入力で同一出力、アンカーは優先的に含まれる、自己リンクなし
 * side_effects: なし
 * failure_modes: なし
 */

import { combineSeed, stringToSeed } from "./communication-id";

export const MAX_COMMUNICATION_PARTNERS = 3;

/**
 * 通信リンクオプション
 * @summary リンク設定
 */
export interface CommunicationLinksOptions {
  round?: number;
  seed?: number | string;
  strategy?: "ring" | "star" | "full";
}

export interface TeamMemberLike {
  id: string;
  role?: string;
}

export function shouldPreferAnchorMember(member: { id: string; role?: string }): boolean {
  const id = member.id.toLowerCase();
  const role = (member.role || "").toLowerCase();
  return (
    id.includes("review") ||
    id.includes("judge") ||
    id.includes("validator") ||
    id.includes("anchor") ||
    role.includes("review") ||
    role.includes("judge") ||
    role.includes("validator")
  );
}

/**
 * 通信リンクマップを作成する
 * @summary リンクマップ生成
 * @param members メンバーリスト
 * @param options リンクオプション
 * @returns メンバーID→パートナーIDリストのマップ
 */
export function createCommunicationLinksMap(
  members: TeamMemberLike[],
  options?: CommunicationLinksOptions
): Map<string, string[]> {
  const round = options?.round ?? 0;
  const seed = typeof options?.seed === "string"
    ? stringToSeed(options.seed)
    : (options?.seed ?? 0);
  const strategy = options?.strategy ?? "ring";

  if (members.length <= 1) {
    return new Map(members.map(m => [m.id, []]));
  }

  const ids = members.map(m => m.id);
  const anchors = members.filter(shouldPreferAnchorMember).map(m => m.id);
  const candidates = buildCandidates(ids, anchors, strategy);

  const result = new Map<string, string[]>();
  for (const id of ids) {
    const partnerCandidates = candidates.get(id) ?? new Set<string>();
    const partners = selectPartnersDeterministic(
      id,
      partnerCandidates,
      anchors,
      round,
      seed,
      MAX_COMMUNICATION_PARTNERS
    );
    result.set(id, partners);
  }

  return result;
}

function buildCandidates(
  ids: string[],
  anchors: string[],
  strategy: "ring" | "star" | "full"
): Map<string, Set<string>> {
  const candidates = new Map<string, Set<string>>(ids.map(id => [id, new Set<string>()]));

  const addLink = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    candidates.get(fromId)?.add(toId);
  };

  if (strategy === "ring") {
    for (let i = 0; i < ids.length; i++) {
      const prev = ids[(i - 1 + ids.length) % ids.length];
      const next = ids[(i + 1) % ids.length];
      addLink(ids[i], prev);
      addLink(ids[i], next);
    }
  } else if (strategy === "full") {
    for (const id of ids) {
      for (const other of ids) {
        addLink(id, other);
      }
    }
  }

  if (anchors.length > 0) {
    for (const id of ids) {
      for (const anchorId of anchors) {
        addLink(id, anchorId);
        addLink(anchorId, id);
      }
    }
  }

  return candidates;
}

function selectPartnersDeterministic(
  memberId: string,
  candidates: Set<string>,
  anchors: string[],
  round: number,
  seed: number,
  maxPartners: number
): string[] {
  candidates = new Set([...candidates].filter(id => id !== memberId));

  const required = [...candidates].filter(id => anchors.includes(id));
  const remaining = [...candidates].filter(id => !anchors.includes(id));

  const memberSeed = combineSeed(seed, memberId, round);
  const sortedRemaining = [...remaining].sort((a, b) => a.localeCompare(b));
  const shuffled = deterministicShuffle(sortedRemaining, memberSeed);

  const combined = [...required, ...shuffled];
  return combined.slice(0, maxPartners);
}

/**
 * 決定論的シャッフルを行う
 * @summary 決定論的配列シャッフル
 * @param array シャッフル対象配列
 * @param seed シード値
 * @returns シャッフル済み配列
 */
export function deterministicShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = xorshift32(s);
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function xorshift32(x: number): number {
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
