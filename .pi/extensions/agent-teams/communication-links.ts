/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-links.ts
 * role: チーム内メンバー間の通信リンク（対話相手）の決定ロジックを提供する
 * why: エージェント間の対話構造（リング、スター、フル、スパースグラフ）を制御し、特定ロールを優先する接続を形成するため
 * related: ./communication-id, ./agent-teams.ts, ./mdm-types.ts, ./cortexdebate-config.ts
 * public_api: MAX_COMMUNICATION_PARTNERS, CommunicationLinksOptions, TeamMemberLike, shouldPreferAnchorMember, createCommunicationLinksMap
 * invariants: 返されるMapのキーは引数membersのすべてのIDを含む, リンク相手は常に引数members内のIDである, リンク数はMAX_COMMUNICATION_PARTNERSを超えない
 * side_effects: なし（純粋関数）
 * failure_modes: membersが空の場合は空のMapを返す, 重複IDが含まれる場合の動作は未定義, sparse-graph戦略でCortexDebate無効時はringにフォールバック
 * @abdd.explain
 * overview: メンバーリストと戦略に基づき、各メンバーが通信すべき相手のリストを決定するモジュール
 * what_it_does:
 *   - メンバーID、ラウンド数、シード値を用いて、決定論的に通信相手を選択する
 *   - リング、スター、フル、スパースグラフの4種類のトポロジー戦略に基づき候補を生成する
 *   - reviewやjudgeなどの役割を持つメンバー（アンカー）を通信相手として優先的に追加する
 *   - CortexDebate有効時、MDM状態と議論グラフに基づくスパースグラフ接続を提供する
 * why_it_exists:
 *   - マルチエージェント環境における通信経路の制御を一元化するため
 *   - ラウンドやシード値によって再現可能なコミュニケーションパターンを生成するため
 *   - 大規模チームでの通信オーバーヘッドを削減するため
 * scope:
 *   in: メンバー定義リスト、戦略設定、乱数シード、ラウンド数、MDM状態（sparse-graph用）、議論グラフ（sparse-graph用）
 *   out: メンバーIDをキーとした通信相手IDリストのMap
 */

import { combineSeed, stringToSeed } from "./communication-id";
import type { MDMState, DebateGraph } from "./mdm-types";
import { isCortexDebateEnabled } from "./cortexdebate-config";

export const MAX_COMMUNICATION_PARTNERS = 3;

/**
 * 通信リンクオプション
 * @summary リンク設定
 * @param round ラウンド番号
 * @param seed 乱数シード
 * @param strategy 通信トポロジー戦略
 * @param mdmState CortexDebate用MDM状態
 * @param debateGraph CortexDebate用議論グラフ
 */
export interface CommunicationLinksOptions {
  round?: number;
  seed?: number | string;
  strategy?: "ring" | "star" | "full" | "sparse-graph";
  /** CortexDebate: MDM state for sparse-graph strategy */
  mdmState?: MDMState;
  /** CortexDebate: Graph data for topology-aware linking */
  debateGraph?: DebateGraph;
}

/**
 * チームメンバー型定義
 * @summary メンバー型定義
 */
export interface TeamMemberLike {
  id: string;
  role?: string;
}

/**
 * アンカー優先判定
 * @summary アンカー優先判定
 * @param member チームメンバー情報
 * @returns アンカー優先ならtrue
 */
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

  // CortexDebate: Sparse graph strategy
  if (strategy === "sparse-graph") {
    if (!isCortexDebateEnabled()) {
      // Fallback to ring strategy if CortexDebate is disabled
      return createCommunicationLinksMap(members, { ...options, strategy: "ring" });
    }
    if (!options?.mdmState || !options?.debateGraph) {
      // Fallback to ring strategy if required data is missing
      return createCommunicationLinksMap(members, { ...options, strategy: "ring" });
    }
    return createSparseGraphLinks(members, options.mdmState, options.debateGraph, round, seed);
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

/**
 * スパースグラフベースの通信リンクを作成
 * @summary スパースグラフリンク生成
 * @param members メンバーリスト
 * @param mdmState MDM状態
 * @param debateGraph 議論グラフ
 * @param round ラウンド番号
 * @param seed シード値
 * @returns メンバーID→パートナーIDリストのマップ
 */
function createSparseGraphLinks(
  members: TeamMemberLike[],
  mdmState: MDMState,
  debateGraph: DebateGraph,
  round: number,
  seed: number
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const memberIds = new Set(members.map(m => m.id));

  for (const member of members) {
    const nodeId = `node-${member.id}`;
    const nodeEdges = debateGraph.edges.get(nodeId) ?? [];

    // Extract partner IDs from edges, sorted by weight
    const partners = nodeEdges
      .filter(e => e.weight >= 0.1) // Minimum weight threshold
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_COMMUNICATION_PARTNERS)
      .map(e => {
        // Extract memberId from nodeId
        const match = e.target.match(/^node-(.+)$/);
        return match ? match[1] : e.target;
      })
      .filter(id => memberIds.has(id) && id !== member.id);

    result.set(member.id, partners);
  }

  // Ensure all members have an entry
  for (const member of members) {
    if (!result.has(member.id)) {
      result.set(member.id, []);
    }
  }

  // Apply MDM-based modulation for members without graph connections
  // Connect based on MDM distance for isolated members
  for (const member of members) {
    const currentPartners = result.get(member.id) ?? [];
    if (currentPartners.length === 0) {
      const memberPosition = mdmState.positions.get(member.id);
      if (memberPosition) {
        // Find closest members in MDM space
        const distances: Array<{ id: string; distance: number }> = [];
        for (const other of members) {
          if (other.id === member.id) continue;
          const otherPosition = mdmState.positions.get(other.id);
          if (otherPosition) {
            const distance = computeMDMDistance(memberPosition, otherPosition);
            distances.push({ id: other.id, distance });
          }
        }
        distances.sort((a, b) => a.distance - b.distance);
        const fallbackPartners = distances
          .slice(0, MAX_COMMUNICATION_PARTNERS)
          .map(d => d.id);
        result.set(member.id, fallbackPartners);
      }
    }
  }

  return result;
}

/**
 * MDM空間内の距離を計算
 * @summary MDM距離計算
 * @param a 位置ベクトルA
 * @param b 位置ベクトルB
 * @returns ユークリッド距離
 */
function computeMDMDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}
