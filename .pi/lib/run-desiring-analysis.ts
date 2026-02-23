/**
 * @abdd.meta
 * path: .pi/lib/run-desiring-analysis.ts
 * role: デシア-プロダクション（欲望-生産）分析の結果を整形し、コンソールに出力するスクリプト
 * why: 分析ロジックと出力処理を分離し、スキゾ分析の診断結果を可視化するため
 * related: .pi/lib/desiring-production.ts
 * public_api: runDesiringAnalysis
 * invariants: analyzeDesiringProductionがオブジェクトを返すこと、console.logが利用可能であること
 * side_effects: 標準出力へのログ書き込み
 * failure_modes: analyzeDesiringProductionが例外を投げた場合の出力停止、console出力の文字化け（環境依存）
 * @abdd.explain
 * overview: 欲望機械や流れの状態、および脱領土化の可能性を計算し、そのサマリーをレポートとして出力する
 * what_it_does:
 *   - 欲望-生産分析を実行し、機械数や流れの本数などを集計する
 *   - 強度が低い欲望機械（抑圧されているもの）を抽出して表示する
 *   - 阻害されている流れとその阻害者を表示する
 *   - 強度が最も高い脱領土化の可能性を特定して表示する
 *   - 仮説を否定する証拠を検索し、修正された理解を表示する
 * why_it_exists:
 *   - 分析結果を人間が読みやすい形式で直ちに確認するため
 *   - デバッグや現在のシステム状態の把握を容易にするため
 * scope:
 *   in: なし（依存先モジュールからのデータ取得のみ）
 *   out: 標準出力へのフォーマットされた文字列（診断レポート）
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
