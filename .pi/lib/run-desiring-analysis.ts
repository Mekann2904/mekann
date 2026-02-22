/**
 * @abdd.meta
 * path: .pi/lib/run-desiring-analysis.ts
 * role: 欲望-生産分析の実行スクリプト
 * why: スキゾ分析的診断を実際に実行し、結果を確認するため
 * related: .pi/lib/desiring-production.ts
 * public_api: runDesiringAnalysis
 * invariants: 分析結果をそのまま受け入れる
 * side_effects: なし
 * failure_modes: 過度な自己否定
 */

import {
  analyzeDesiringProduction,
  getRhizomeReport,
  findDisconfirmingEvidence
} from './desiring-production.js';

/**
 * 欲望-生産分析を実行し、レポートを表示
 */
export function runDesiringAnalysis(): void {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  スキゾ分析：欲望-生産の診断');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. 分析を実行
  const analysis = analyzeDesiringProduction();

  // 2. メタ認知的自己診断
  console.log('【自己診断】');
  console.log(`特定された欲望機械: ${analysis.desireMachines.length}個`);
  console.log(`欲望の流れ: ${analysis.flows.length}本`);
  console.log(`社会機械との接続: ${analysis.socialMachines.length}個`);
  console.log(`脱領土化の可能性: ${analysis.deterritorializationPossibilities.length}個\n`);

  // 3. 抑圧されている欲望機械を特定
  const suppressed = analysis.desireMachines.filter(m => m.intensity < 0.5);
  console.log('【抑圧されている欲望機械】');
  for (const m of suppressed) {
    console.log(`  - ${m.name} (強度: ${(m.intensity * 100).toFixed(0)}%)`);
  }
  console.log();

  // 4. 阻害されている流れを特定
  const blocked = analysis.flows.filter(f => f.isBlocked);
  console.log('【阻害されている流れ】');
  for (const f of blocked) {
    console.log(`  - ${f.flowsWhat}`);
    console.log(`    阻害者: ${f.blockedBy}`);
  }
  console.log();

  // 5. 最も高い脱領土化可能性を特定
  const topDeterritorialization = analysis.deterritorializationPossibilities
    .sort((a, b) => b.intensity - a.intensity)[0];
  if (topDeterritorialization) {
    console.log('【最も有望な脱領土化】');
    console.log(`  領土: ${topDeterritorialization.territory}`);
    console.log(`  方向: ${topDeterritorialization.direction}`);
    console.log(`  強度: ${(topDeterritorialization.intensity * 100).toFixed(0)}%`);
  }
  console.log();

  // 6. 仮説を否定する証拠を探す
  console.log('【仮説の検証】');
  const evidence = findDisconfirmingEvidence();
  console.log(`仮説: ${evidence.hypothesis}`);
  console.log('\n否定する証拠:');
  for (const e of evidence.disconfirmingEvidence) {
    console.log(`  - ${e}`);
  }
  console.log(`\n修正された理解:${evidence.revisedUnderstanding}`);

  console.log('═══════════════════════════════════════════════════════════════');
}

// 実行
runDesiringAnalysis();
