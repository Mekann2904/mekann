/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-history.ts
 * role: コミュニケーションラウンド間の参照履歴管理
 * why: Phase 5のadaptive partner selectionのための仕込み
 * related: .pi/extensions/agent-teams/communication-links.ts, communication-references.ts
 * public_api: CommunicationHistory, CommunicationHistoryStore, createCommunicationHistoryStore
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 */

export interface CommunicationHistory {
  round: number;
  memberId: string;
  referencedPartnerIds: string[];
  coverage: number;
  specificity: number;
  stanceSummary: {
    agree: number;
    disagree: number;
    neutral: number;
    unknown: number;
  };
}

export interface CommunicationHistoryStore {
  add(entry: CommunicationHistory): void;
  getByMember(memberId: string): CommunicationHistory[];
  getByRound(round: number): CommunicationHistory[];
  getAll(): CommunicationHistory[];
  getUnreferencedPartnerIds(memberId: string, partnerIds: string[]): string[];
  getMostRecentRound(): number;
  clear(): void;
}

export function createCommunicationHistoryStore(): CommunicationHistoryStore {
  const entries: CommunicationHistory[] = [];

  return {
    add(entry: CommunicationHistory): void {
      entries.push(entry);
    },

    getByMember(memberId: string): CommunicationHistory[] {
      return entries.filter(e => e.memberId === memberId);
    },

    getByRound(round: number): CommunicationHistory[] {
      return entries.filter(e => e.round === round);
    },

    getAll(): CommunicationHistory[] {
      return [...entries];
    },

    getUnreferencedPartnerIds(memberId: string, partnerIds: string[]): string[] {
      const memberHistory = this.getByMember(memberId);
      const referenced = new Set(
        memberHistory.flatMap(e => e.referencedPartnerIds)
      );
      return partnerIds.filter(id => !referenced.has(id));
    },

    getMostRecentRound(): number {
      if (entries.length === 0) return -1;
      return Math.max(...entries.map(e => e.round));
    },

    clear(): void {
      entries.length = 0;
    },
  };
}

export interface PartnerSelectionStrategy {
  select(
    memberId: string,
    candidates: string[],
    history: CommunicationHistoryStore,
    round: number
  ): string[];
}

export const DEFAULT_MAX_PARTNERS = 3;

export const defaultSelectionStrategy: PartnerSelectionStrategy = {
  select(memberId, candidates, _history, _round) {
    return candidates.slice(0, DEFAULT_MAX_PARTNERS);
  }
};

export const adaptiveSelectionStrategy: PartnerSelectionStrategy = {
  select(memberId, candidates, history, round) {
    if (round === 0) {
      return candidates.slice(0, DEFAULT_MAX_PARTNERS);
    }

    const unreferenced = history.getUnreferencedPartnerIds(memberId, candidates);
    const referenced = candidates.filter(c => !unreferenced.includes(c));

    const prioritized = [...unreferenced, ...referenced];
    return prioritized.slice(0, DEFAULT_MAX_PARTNERS);
  }
};
