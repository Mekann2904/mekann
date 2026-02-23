/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-history.ts
 * role: エージェント間通信履歴の管理と次回対話相手選択ロジックの提供
 * why: 過去の対話記録に基づいて、未対話のエージェントを優先するなど、適応的なパートナー選択を実現するため
 * related: .pi/extensions/agent-teams/agent.ts, .pi/extensions/agent-teams/team.ts
 * public_api: CommunicationHistory, CommunicationHistoryStore, createCommunicationHistoryStore, PartnerSelectionStrategy, DEFAULT_MAX_PARTNERS, defaultSelectionStrategy, adaptiveSelectionStrategy
 * invariants: CommunicationHistoryのroundは整数、stanceSummaryの合計は任意の値を取りうる、Storeはメモリ上の配列を保持する
 * side_effects: createCommunicationHistoryStoreはクロージャ内の配列を状態として保持・変更する
 * failure_modes: 履歴が肥大化すると検索パフォーマンスが低下する、clear()実行で全履歴が失われる
 * @abdd.explain
 * overview: 通信履歴のデータ構造、そのインメモリストア、およびストアを利用したパートナー選択アルゴリズムを定義するモジュール
 * what_it_does:
 *   - 通信ラウンド、メンバーID、参照先リスト、評価指標を含む履歴エントリを定義する
 *   - 履歴の追加、メンバー/ラウンド指定での取得、未参照パートナー特定、ラウンド削除を行うストアを実装する
 *   - 候補リストの先頭から固定数を選ぶデフォルト戦略と、未参照パートナーを優先する適応型戦略を提供する
 * why_it_exists:
 *   - エージェントが誰と対話したかを追跡し、多様な接続を促進するため
 *   - 対話履歴を用いた戦略的なパートナー選択を可能にするため
 * scope:
 *   in: 履歴エントリ、メンバーID、ラウンド番号、候補パートナーIDリスト
 *   out: 保存された履歴コレクション、選択されたパートナーIDリスト、最大ラウンド番号
 */

/**
 * 通信履歴エントリ
 * @summary 通信履歴記録
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

/**
 * 通信履歴ストアインターフェース
 * @summary 履歴ストアAPI
 */
export interface CommunicationHistoryStore {
  add(entry: CommunicationHistory): void;
  getByMember(memberId: string): CommunicationHistory[];
  getByRound(round: number): CommunicationHistory[];
  getAll(): CommunicationHistory[];
  getUnreferencedPartnerIds(memberId: string, partnerIds: string[]): string[];
  getMostRecentRound(): number;
  clear(): void;
}

/**
 * 通信履歴ストアを作成する
 * @summary 履歴ストア生成
 * @returns 通信履歴ストアインスタンス
 */
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

/**
 * パートナー選択戦略
 * @summary パートナー戦略定義
 */
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
