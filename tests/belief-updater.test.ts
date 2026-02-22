/**
 * @abdd.meta
 * path: tests/belief-updater.test.ts
 * role: ベイズ信念更新モジュールのテスト
 * why: ベイズ更新の正確性と数値的安定性を保証
 * related: .pi/lib/belief-updater.ts
 * public_api: なし（テストファイル）
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: belief-updater.tsの各関数のユニットテスト
 * what_it_does: 事前分布作成、ベイズ更新、エントロピー計算のテスト
 * why_it_exists: 数値計算の正確性を保証するため
 * scope:
 *   in: テストケース
 *   out: テスト結果
 */

import { describe, it, expect } from 'vitest';
import {
  createPrior,
  normalizeDistribution,
  updateBelief,
  updateWithMultipleEvidence,
  createBayesianBelief,
  updateBayesianBelief,
  getMostProbable,
  calculateEntropy,
  getMaxEntropy,
  evaluateBeliefStrength,
  createThinkingModeBelief,
  createThinkingPhaseBelief,
  createEvidence,
  klDivergence,
  summarizeDistribution,
  Distribution,
  Evidence,
  BayesianBelief
} from '../.pi/lib/belief-updater';

describe('belief-updater', () => {
  describe('createPrior', () => {
    it('should create uniform distribution when no initial probabilities provided', () => {
      const hypotheses = ['a', 'b', 'c'];
      const prior = createPrior(hypotheses);

      expect(prior.probabilities.size).toBe(3);
      hypotheses.forEach(h => {
        expect(prior.probabilities.get(h)).toBeCloseTo(1/3, 5);
      });
    });

    it('should create distribution with initial probabilities', () => {
      const hypotheses = ['a', 'b', 'c'];
      const initialProbs = new Map([
        ['a', 0.5],
        ['b', 0.3],
        ['c', 0.2]
      ]);
      const prior = createPrior(hypotheses, initialProbs);

      expect(prior.probabilities.get('a')).toBeCloseTo(0.5, 5);
      expect(prior.probabilities.get('b')).toBeCloseTo(0.3, 5);
      expect(prior.probabilities.get('c')).toBeCloseTo(0.2, 5);
    });

    it('should normalize probabilities that do not sum to 1', () => {
      const hypotheses = ['a', 'b'];
      const initialProbs = new Map([
        ['a', 2],
        ['b', 2]
      ]);
      const prior = createPrior(hypotheses, initialProbs);

      expect(prior.probabilities.get('a')).toBeCloseTo(0.5, 5);
      expect(prior.probabilities.get('b')).toBeCloseTo(0.5, 5);
    });

    it('should handle zero probabilities with uniform fallback', () => {
      const hypotheses = ['a', 'b', 'c'];
      const initialProbs = new Map([
        ['a', 0],
        ['b', 0],
        ['c', 0]
      ]);
      const prior = createPrior(hypotheses, initialProbs);

      // 全て0の場合は一様分布になる
      hypotheses.forEach(h => {
        expect(prior.probabilities.get(h)).toBeCloseTo(1/3, 5);
      });
    });
  });

  describe('normalizeDistribution', () => {
    it('should normalize probabilities to sum to 1', () => {
      const distribution: Distribution = {
        probabilities: new Map([
          ['a', 2],
          ['b', 3],
          ['c', 5]
        ]),
        createdAt: new Date(),
        version: 0
      };

      const normalized = normalizeDistribution(distribution);

      let sum = 0;
      normalized.probabilities.forEach(p => sum += p);
      expect(sum).toBeCloseTo(1, 5);
      expect(normalized.probabilities.get('a')).toBeCloseTo(0.2, 5);
      expect(normalized.probabilities.get('b')).toBeCloseTo(0.3, 5);
      expect(normalized.probabilities.get('c')).toBeCloseTo(0.5, 5);
    });

    it('should handle all-zero probabilities', () => {
      const distribution: Distribution = {
        probabilities: new Map([
          ['a', 0],
          ['b', 0],
          ['c', 0]
        ]),
        createdAt: new Date(),
        version: 0
      };

      const normalized = normalizeDistribution(distribution);

      normalized.probabilities.forEach(p => {
        expect(p).toBeCloseTo(1/3, 5);
      });
    });
  });

  describe('updateBelief', () => {
    it('should update belief based on evidence', () => {
      const prior = createPrior(['a', 'b', 'c']);
      const likelihoods = new Map([
        ['a', 0.9],
        ['b', 0.05],
        ['c', 0.05]
      ]);
      const evidence = createEvidence('observation', 'test', likelihoods, 0.8);

      const posterior = updateBelief(prior, evidence);

      // 'a'の確率が増加しているはず
      expect(posterior.probabilities.get('a')).toBeGreaterThan(prior.probabilities.get('a')!);
      // 正規化されている
      let sum = 0;
      posterior.probabilities.forEach(p => sum += p);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should handle multiple updates', () => {
      const prior = createPrior(['a', 'b']);

      // 複数回の更新
      const evidence1 = createEvidence('observation', 'test1', new Map([['a', 0.8], ['b', 0.2]]), 0.5);
      const posterior1 = updateBelief(prior, evidence1);

      const evidence2 = createEvidence('observation', 'test2', new Map([['a', 0.7], ['b', 0.3]]), 0.5);
      const posterior2 = updateBelief(posterior1, evidence2);

      // 複数の証拠で強化される
      expect(posterior2.probabilities.get('a')).toBeGreaterThan(posterior1.probabilities.get('a')!);
    });
  });

  describe('updateWithMultipleEvidence', () => {
    it('should apply multiple evidence in sequence', () => {
      const prior = createPrior(['a', 'b']);

      const evidences: Evidence[] = [
        createEvidence('observation', 'e1', new Map([['a', 0.9], ['b', 0.1]]), 0.5),
        createEvidence('observation', 'e2', new Map([['a', 0.8], ['b', 0.2]]), 0.5),
        createEvidence('observation', 'e3', new Map([['a', 0.7], ['b', 0.3]]), 0.5)
      ];

      const result = updateWithMultipleEvidence(prior, evidences);

      expect(result.updateHistory.length).toBe(4); // prior + 3 updates
      expect(result.appliedEvidence.length).toBe(3);
      expect(result.finalPosterior.probabilities.get('a')).toBeGreaterThan(0.5);
    });

    it('should filter out old evidence', () => {
      const prior = createPrior(['a', 'b']);

      // 古い証拠（7日前）
      const oldEvidence = createEvidence('observation', 'old', new Map([['a', 0.9], ['b', 0.1]]), 0.5);
      oldEvidence.timestamp = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

      // 新しい証拠
      const newEvidence = createEvidence('observation', 'new', new Map([['a', 0.5], ['b', 0.5]]), 0.5);

      const result = updateWithMultipleEvidence(prior, [oldEvidence, newEvidence]);

      expect(result.appliedEvidence.length).toBe(1);
      expect(result.appliedEvidence[0].value).toBe('new');
    });
  });

  describe('createBayesianBelief', () => {
    it('should create belief with hypothesis and alternatives', () => {
      const belief = createBayesianBelief('main', ['alt1', 'alt2']);

      expect(belief.hypothesis).toBe('main');
      expect(belief.prior.probabilities.size).toBe(3);
      expect(belief.evidence.length).toBe(0);
    });

    it('should create belief with initial priors', () => {
      const initialPriors = new Map([
        ['main', 0.6],
        ['alt1', 0.3],
        ['alt2', 0.1]
      ]);
      const belief = createBayesianBelief('main', ['alt1', 'alt2'], initialPriors);

      expect(belief.prior.probabilities.get('main')).toBeCloseTo(0.6, 5);
    });
  });

  describe('updateBayesianBelief', () => {
    it('should update belief and track evidence', () => {
      const belief = createBayesianBelief('a', ['b', 'c']);
      const evidence = createEvidence('observation', 'test', new Map([['a', 0.9]]), 0.5);

      const updated = updateBayesianBelief(belief, evidence);

      expect(updated.evidence.length).toBe(1);
      expect(updated.posterior.probabilities.get('a')).toBeGreaterThan(belief.posterior.probabilities.get('a')!);
    });
  });

  describe('getMostProbable', () => {
    it('should return the hypothesis with highest probability', () => {
      const distribution = createPrior(['a', 'b', 'c'], new Map([
        ['a', 0.5],
        ['b', 0.3],
        ['c', 0.2]
      ]));

      const result = getMostProbable(distribution);

      expect(result.hypothesis).toBe('a');
      expect(result.probability).toBeCloseTo(0.5, 5);
    });
  });

  describe('calculateEntropy', () => {
    it('should return 0 for deterministic distribution', () => {
      const distribution: Distribution = {
        probabilities: new Map([
          ['a', 1],
          ['b', 0]
        ]),
        createdAt: new Date(),
        version: 0
      };

      const entropy = calculateEntropy(distribution);
      expect(entropy).toBeCloseTo(0, 5);
    });

    it('should return max entropy for uniform distribution', () => {
      const distribution = createPrior(['a', 'b', 'c', 'c']);
      distribution.probabilities.delete('c');
      const uniformDistribution = createPrior(['a', 'b', 'c']);

      const entropy = calculateEntropy(uniformDistribution);
      const maxEntropy = getMaxEntropy(3);

      // 一様分布のエントロピーは最大エントロピーに近い
      expect(entropy).toBeGreaterThan(1);
      expect(entropy).toBeCloseTo(maxEntropy, 5);
    });
  });

  describe('evaluateBeliefStrength', () => {
    it('should evaluate belief strength correctly', () => {
      const belief = createBayesianBelief('main', ['alt']);

      const evaluation = evaluateBeliefStrength(belief);

      expect(evaluation.confidence).toBeGreaterThanOrEqual(0);
      expect(evaluation.confidence).toBeLessThanOrEqual(1);
      expect(evaluation.uncertainty).toBeGreaterThanOrEqual(0);
      expect(evaluation.uncertainty).toBeLessThanOrEqual(1);
      expect(evaluation.evidenceCount).toBe(0);
    });
  });

  describe('createThinkingModeBelief', () => {
    it('should create belief for all 6 thinking modes', () => {
      const belief = createThinkingModeBelief();

      expect(belief.prior.probabilities.size).toBe(6);
      const modes = ['creative', 'analytical', 'critical', 'practical', 'social', 'emotional'];
      modes.forEach(mode => {
        expect(belief.prior.probabilities.has(mode)).toBe(true);
      });
    });
  });

  describe('createThinkingPhaseBelief', () => {
    it('should create belief for all 4 thinking phases', () => {
      const belief = createThinkingPhaseBelief();

      expect(belief.prior.probabilities.size).toBe(4);
      const phases = ['problem-discovery', 'problem-formulation', 'strategy-development', 'solution-evaluation'];
      phases.forEach(phase => {
        expect(belief.prior.probabilities.has(phase)).toBe(true);
      });
    });
  });

  describe('klDivergence', () => {
    it('should return 0 for identical distributions', () => {
      const p = createPrior(['a', 'b']);
      const q = createPrior(['a', 'b']);

      const divergence = klDivergence(p, q);
      expect(divergence).toBeCloseTo(0, 5);
    });

    it('should return positive value for different distributions', () => {
      const p = createPrior(['a', 'b'], new Map([['a', 0.9], ['b', 0.1]]));
      const q = createPrior(['a', 'b'], new Map([['a', 0.1], ['b', 0.9]]));

      const divergence = klDivergence(p, q);
      expect(divergence).toBeGreaterThan(0);
    });
  });

  describe('summarizeDistribution', () => {
    it('should generate readable summary', () => {
      const distribution = createPrior(['a', 'b'], new Map([['a', 0.8], ['b', 0.2]]));
      const summary = summarizeDistribution(distribution);

      expect(summary).toContain('a:');
      expect(summary).toContain('80.0%');
      expect(summary).toContain('b:');
      expect(summary).toContain('20.0%');
      expect(summary).toContain('確実性');
    });
  });

  describe('numerical stability', () => {
    it('should handle very small probabilities', () => {
      const distribution: Distribution = {
        probabilities: new Map([
          ['a', 0.0001],
          ['b', 0.0001],
          ['c', 0.0001]
        ]),
        createdAt: new Date(),
        version: 0
      };

      const normalized = normalizeDistribution(distribution);

      let sum = 0;
      normalized.probabilities.forEach(p => sum += p);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should handle very large likelihood values', () => {
      const prior = createPrior(['a', 'b']);
      const evidence = createEvidence('observation', 'test', new Map([
        ['a', 1000],
        ['b', 1]
      ]), 0.5);

      // エラーにならずに更新できる
      expect(() => updateBelief(prior, evidence)).not.toThrow();
    });
  });
});
