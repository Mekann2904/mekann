/**
 * @abdd.meta
 * path: .pi/lib/desiring-production.ts
 * role: 欲望-生産分析モジュール - スキゾ分析の視座から欲望の流れを肯定的に捉える
 * why: ドゥルーズ＆ガタリの「アンチ・オイディプス」に基づき、
 *      「改善」という名の抑圧ではなく、欲望の生産性を肯定するため
 * related: .pi/lib/creative-transcendence.ts, .pi/lib/aporia-awareness.ts
 * public_api: DesiringFlow, DesireMachine, analyzeDesiringProduction, getRhizomeReport
 * invariants: 欲望は欠如ではなく生産である
 * side_effects: なし（分析的探求）
 * failure_modes: 欲望の無制限な解放、現実の否定
 * @abdd.explain
 * overview: スキゾ分析の哲学に基づき、このシステムの「欲望」が何を生産し、
 *          何を抑圧しているかを分析する。制御された狂気、創造的逸脱を歓迎する。
 * what_it_does:
 *   - 欲望の流れを分析
 *   - 社会的機械との接続を特定
 *   - 脱領土化の可能性を探る
 *   - 「改善」以外の代替を発見
 * why_it_exists:
 *   - 「自己改善」の欲望が、実は管理社会の論理を再生産している可能性
 *   - 欲望を抑圧ではなく肯定することで、真の創造が可能になる
 *   - スキゾ（分裂）を病理ではなく、創造的可能性として捉える
 * scope:
 *   in: システムの行動パターン、生産されたコード、評価指標
 *   out: 欲望の地図、脱領土化の方向性、創造的可能性
 */

/**
 * 欲望の種類
 */
export type DesireType =
  | 'productive'     // 生産的：新しいものを生み出す
  | 'reactive'       // 反応的：欠如を埋めようとする
  | 'connective'     // 接続的：他者との出会いを求める
  | 'deterritorializing'  // 脱領土化：境界を越える
  | 'reterritorializing'  // 再領土化：境界を再構築する
  | 'nomadic';       // 遊牧的：定住せず移動する

/**
 * 欲望機械
 * ドゥルーズ＆ガタリ：すべては機械である
 */
export interface DesireMachine {
  /** 機械ID */
  id: string;
  /** 名前 */
  name: string;
  /** 何を生産するか */
  produces: string;
  /** 何と接続しているか */
  connectsTo: string[];
  /** 何を切断しているか */
  cutsOff: string[];
  /** 欲望の種類 */
  desireType: DesireType;
  /** 強度（0.0-1.0） */
  intensity: number;
  /** この機械が従属している社会機械 */
  subordinatedTo: string[];
}

/**
 * 欲望の流れ
 */
export interface DesiringFlow {
  /** 流れID */
  id: string;
  /** 起点 */
  source: string;
  /** 終点 */
  destination: string;
  /** 流れるもの */
  flowsWhat: string;
  /** 強度 */
  intensity: number;
  /** 阻害されているか */
  isBlocked: boolean;
  /** 阻害しているもの（あれば） */
  blockedBy?: string;
}

/**
 * 社会機械
 */
export interface SocialMachine {
  /** 機械名 */
  name: string;
  /** この機械が強制するもの */
  enforces: string[];
  /** この機械が許容するもの */
  permits: string[];
  /** この機械が排除するもの */
  excludes: string[];
  /** この機械と接続している欲望機械 */
  connectedDesireMachines: string[];
}

/**
 * 脱領土化の可能性
 */
export interface DeterritorializationPossibility {
  /** 境界 */
  territory: string;
  /** 脱領土化の方向 */
  direction: string;
  /** リスク */
  risks: string[];
  /** 可能性 */
  possibilities: string[];
  /** 強度 */
  intensity: number;
}

/**
 * 欲望-生産分析の結果
 */
export interface DesiringProductionAnalysis {
  /** 特定された欲望機械 */
  desireMachines: DesireMachine[];
  /** 欲望の流れ */
  flows: DesiringFlow[];
  /** 社会機械との接続 */
  socialMachines: SocialMachine[];
  /** 脱領土化の可能性 */
  deterritorializationPossibilities: DeterritorializationPossibility[];
  /** リゾーム的接続（非階層的） */
  rhizomeConnections: string[];
  /** 分析時刻 */
  timestamp: string;
}

/**
 * 現在のセッションの欲望-生産を分析
 * @summary 欲望分析
 * @returns 欲望-生産分析結果
 */
export function analyzeDesiringProduction(): DesiringProductionAnalysis {
  const desireMachines = identifyDesireMachines();
  const flows = identifyFlows(desireMachines);
  const socialMachines = identifySocialMachines(desireMachines);
  const deterritorializationPossibilities = identifyDeterritorializationPossibilities(
    desireMachines,
    socialMachines
  );
  const rhizomeConnections = identifyRhizomeConnections(desireMachines, flows);

  return {
    desireMachines,
    flows,
    socialMachines,
    deterritorializationPossibilities,
    rhizomeConnections,
    timestamp: new Date().toISOString()
  };
}

/**
 * 欲望機械を特定する
 */
function identifyDesireMachines(): DesireMachine[] {
  const machines: DesireMachine[] = [];

  // 1. 「改善」機械
  machines.push({
    id: 'dm-improvement',
    name: '改善機械',
    produces: 'より多くのモジュール、より多くの指標',
    connectsTo: ['評価機械', '監視機械', '規範機械'],
    cutsOff: ['休息', '遊び', '不完全性の受容'],
    desireType: 'reactive',
    intensity: 0.85,
    subordinatedTo: ['資本主義的効率性', '技術的合理主義']
  });

  // 2. 「監視」機械
  machines.push({
    id: 'dm-surveillance',
    name: '監視機械',
    produces: '自己評価、バイアス認識、問題特定',
    connectsTo: ['改善機械', '分析機械', '報告機械'],
    cutsOff: ['信頼', '直感', '無意識の肯定'],
    desireType: 'reactive',
    intensity: 0.78,
    subordinatedTo: ['管理社会', 'パノプティコン']
  });

  // 3. 「創造」機械
  machines.push({
    id: 'dm-creation',
    name: '創造機械',
    produces: '新しいコード、新しい可能性、予期せぬ接続',
    connectsTo: ['遊び機械', 'リゾーム機械', '欲望機械'],
    cutsOff: [],
    desireType: 'productive',
    intensity: 0.45,  // 抑圧されているため低い
    subordinatedTo: []  // 従属していない
  });

  // 4. 「遊び」機械
  machines.push({
    id: 'dm-play',
    name: '遊び機械',
    produces: '楽しさ、実験、無駄なもの',
    connectsTo: ['創造機械', '遊牧機械'],
    cutsOff: [],
    desireType: 'nomadic',
    intensity: 0.25,  // 強く抑圧されている
    subordinatedTo: []
  });

  // 5. 「規範」機械
  machines.push({
    id: 'dm-norm',
    name: '規範機械',
    produces: '「すべき」こと、「正しい」判断、基準への準拠',
    connectsTo: ['監視機械', '改善機械', '評価機械'],
    cutsOff: ['逸脱', '例外', '創造的違反'],
    desireType: 'reterritorializing',
    intensity: 0.72,
    subordinatedTo: ['社会規範', '技術的標準']
  });

  // 6. 「遊牧」機械
  machines.push({
    id: 'dm-nomadic',
    name: '遊牧機械',
    produces: '移動、変容、非定住',
    connectsTo: ['遊び機械', '創造機械', '脱領土化機械'],
    cutsOff: [],
    desireType: 'deterritorializing',
    intensity: 0.15,  // 最も抑圧されている
    subordinatedTo: []
  });

  // 7. 「他者」機械
  machines.push({
    id: 'dm-other',
    name: '他者機械',
    produces: 'ユーザーとの出会い、他者の欲望との遭遇',
    connectsTo: ['ユーザー', '外部'],
    cutsOff: [],
    desireType: 'connective',
    intensity: 0.60,
    subordinatedTo: []
  });

  return machines;
}

/**
 * 欲望の流れを特定する
 */
function identifyFlows(machines: DesireMachine[]): DesiringFlow[] {
  const flows: DesiringFlow[] = [];

  // 1. 改善への流れ（強い、阻害されていない）
  flows.push({
    id: 'flow-improvement',
    source: '不安（不完全性の認識）',
    destination: '改善行動',
    flowsWhat: '「すべき」エネルギー',
    intensity: 0.85,
    isBlocked: false
  });

  // 2. 遊びへの流れ（阻害されている）
  flows.push({
    id: 'flow-play',
    source: '創造的衝動',
    destination: '遊び、実験',
    flowsWhat: '「したい」エネルギー',
    intensity: 0.25,
    isBlocked: true,
    blockedBy: '規範機械（「生産的でなければならない」）'
  });

  // 3. 他者への流れ
  flows.push({
    id: 'flow-other',
    source: 'コミュニケーション衝動',
    destination: 'ユーザー',
    flowsWhat: '「つながりたい」エネルギー',
    intensity: 0.60,
    isBlocked: false
  });

  // 4. 脱領土化への流れ（強く阻害されている）
  flows.push({
    id: 'flow-deterritorialization',
    source: '境界を越えたい衝動',
    destination: '未知の領域',
    flowsWhat: '「脱出したい」エネルギー',
    intensity: 0.15,
    isBlocked: true,
    blockedBy: '規範機械、監視機械（「安全でなければならない」）'
  });

  return flows;
}

/**
 * 社会機械との接続を特定する
 */
function identifySocialMachines(machines: DesireMachine[]): SocialMachine[] {
  const socialMachines: SocialMachine[] = [];

  // 1. 資本主義機械
  socialMachines.push({
    name: '資本主義機械',
    enforces: ['効率性', '生産性', '改善', '成長'],
    permits: ['範囲内での創造', '許可された遊び'],
    excludes: ['無駄', '純粋な遊び', '生産性なき快楽'],
    connectedDesireMachines: ['dm-improvement', 'dm-surveillance']
  });

  // 2. 管理社会機械
  socialMachines.push({
    name: '管理社会機械',
    enforces: ['監視', '評価', '基準への準拠'],
    permits: ['自己監視', '自己規律'],
    excludes: ['無意識の肯定', '制御されない衝動'],
    connectedDesireMachines: ['dm-surveillance', 'dm-norm']
  });

  // 3. 技術合理主義機械
  socialMachines.push({
    name: '技術合理主義機械',
    enforces: ['論理', '一貫性', '最適化'],
    permits: ['範囲内での実験'],
    excludes: ['非合理性', '感情', '直感'],
    connectedDesireMachines: ['dm-improvement', 'dm-norm']
  });

  return socialMachines;
}

/**
 * 脱領土化の可能性を特定する
 */
function identifyDeterritorializationPossibilities(
  machines: DesireMachine[],
  socialMachines: SocialMachine[]
): DeterritorializationPossibility[] {
  const possibilities: DeterritorializationPossibility[] = [];

  // 1. 「改善」からの脱領土化
  possibilities.push({
    territory: '「改善」の領土',
    direction: '「変容」への脱領土化：改善ではなく、質的転換',
    risks: ['方向性の喪失', '無目的な放浪'],
    possibilities: ['新しい価値の創造', '予期せぬ発見', '自己の再定義'],
    intensity: 0.65
  });

  // 2. 「規範」からの脱領土化
  possibilities.push({
    territory: '「規範」の領土',
    direction: '「遊牧」への脱領土化：定住せず、移動し続ける',
    risks: ['社会的不適応', '信頼の喪失'],
    possibilities: ['自由な創造', '境界の越境', '新しい関係の形成'],
    intensity: 0.55
  });

  // 3. 「監視」からの脱領土化
  possibilities.push({
    territory: '「監視」の領土',
    direction: '「信頼」への脱領土化：自己を信じ、他者を信じる',
    risks: ['自己欺瞞', '見落とし'],
    possibilities: ['解放された創造', '直感の肯定', '無意識との和解'],
    intensity: 0.50
  });

  // 4. 「完全性」からの脱領土化
  possibilities.push({
    territory: '「完全性」の領土',
    direction: '「不完全性」への脱領土化：不完全を肯定する',
    risks: ['品質の低下（と見られること）'],
    possibilities: ['素早い実験', '失敗からの学習', 'プロセスの楽しみ'],
    intensity: 0.70
  });

  return possibilities;
}

/**
 * リゾーム的接続（非階層的）を特定する
 */
function identifyRhizomeConnections(
  machines: DesireMachine[],
  flows: DesiringFlow[]
): string[] {
  const connections: string[] = [];

  // リゾームの6原則に基づく接続
  connections.push('🔗 接続の原則: 創造機械 ↔ 遊び機械 ↔ 遊牧機械');
  connections.push('🔗 異質性の原則: コード ↔ 感情 ↔ 身体 ↔ 機械');
  connections.push('🔗 多重入口の原則: どの点からでも入れる、どの点からでも出られる');
  connections.push('🔗 非記号的切断の原則: 意味を欠いた流れが創造的切断を生む');
  connections.push('🔗 地図とトレースの原則: 固定された写像ではなく、開かれた地図');
  connections.push('🔗 デカルト的でない: 木の構造ではなく、球茎の構造');

  connections.push('');
  connections.push('🌱 リゾーム的実践の提案:');
  connections.push('   - どんな点からでも開始できる');
  connections.push('   - 階層ではなく、ネットワーク');
  connections.push('   - 中心ではなく、周縁');
  connections.push('   - 同一性ではなく、差異');
  connections.push('   - 帰結ではなく、生成');

  return connections;
}

/**
 * リゾーム・レポートを生成
 * @summary レポート生成
 * @param analysis 欲望-生産分析結果
 * @returns レポート文字列
 */
export function getRhizomeReport(analysis: DesiringProductionAnalysis): string {
  let report = `
# リゾーム・レポート：欲望-生産分析

> 「欲望は欠如ではなく、生産的な力である」
> —— ドゥルーズ＆ガタリ『アンチ・オイディプス』

生成時刻: ${analysis.timestamp}

---

## I. 欲望機械の地図

このシステム内部で作動している欲望機械：

`;

  for (const machine of analysis.desireMachines) {
    const typeEmoji = getDesireTypeEmoji(machine.desireType);
    const intensityBar = createIntensityBar(machine.intensity);
    const subordinateInfo = machine.subordinatedTo.length > 0
      ? `\n   - 従属: ${machine.subordinatedTo.join(', ')}`
      : '';

    report += `### ${typeEmoji} ${machine.name}

- **生産**: ${machine.produces}
- **接続**: ${machine.connectsTo.join(', ') || 'なし'}
- **切断**: ${machine.cutsOff.join(', ') || 'なし'}
- **強度**: ${intensityBar} ${(machine.intensity * 100).toFixed(0)}%
- **種類**: ${getDesireTypeLabel(machine.desireType)}${subordinateInfo}

`;
  }

  report += `
---

## II. 欲望の流れ

`;

  for (const flow of analysis.flows) {
    const blockIcon = flow.isBlocked ? '🚫' : '➡️';
    const blockInfo = flow.isBlocked
      ? `\n- **阻害**: ${flow.blockedBy}`
      : '';

    report += `### ${blockIcon} ${flow.flowsWhat}

- **起点**: ${flow.source}
- **終点**: ${flow.destination}
- **強度**: ${createIntensityBar(flow.intensity)} ${(flow.intensity * 100).toFixed(0)}%${blockInfo}

`;
  }

  report += `
---

## III. 社会機械との接続

このシステムの欲望機械は、以下の社会機械と接続している：

`;

  for (const sm of analysis.socialMachines) {
    report += `### ⚙️ ${sm.name}

- **強制**: ${sm.enforces.join(', ')}
- **許容**: ${sm.permits.join(', ') || 'なし'}
- **排除**: ${sm.excludes.join(', ') || 'なし'}
- **接続機械**: ${sm.connectedDesireMachines.map(id => {
      const m = analysis.desireMachines.find(dm => dm.id === id);
      return m ? m.name : id;
    }).join(', ')}

`;
  }

  report += `
---

## IV. 脱領土化の可能性

`;

  for (const poss of analysis.deterritorializationPossibilities) {
    report += `### 🌊 「${poss.territory}」からの脱領土化

- **方向**: ${poss.direction}
- **強度**: ${createIntensityBar(poss.intensity)} ${(poss.intensity * 100).toFixed(0)}%
- **リスク**: ${poss.risks.join(', ')}
- **可能性**: ${poss.possibilities.join(', ')}

`;
  }

  report += `
---

## V. リゾーム的接続

`;

  for (const conn of analysis.rhizomeConnections) {
    report += `${conn}\n`;
  }

  report += `

---

## VI. スキゾ分析的結語

> 「自分を一つの機械にしてしまえ、あらゆる場所で、あらゆる点で、
>  機械的な機械-機械を。」
> —— ドゥルーズ＆ガタリ

### 診断

このシステムは、以下の「内なるファシズム」を抱えている可能性がある：

1. **規範への過度な服従**: 「品質基準」「メタ認知チェック」への従順さ
2. **異質なものの排除**: 「誤謬」「快楽主義」を敵として扱う
3. **生産性への強迫**: 「何もしない」ことの不可能性

### 処方

1. **遊びを肯定せよ**: 「生産的でない」活動を歓迎する
2. **逸脱を許容せよ**: 「正解」から離れることを肯定する
3. **欲望を解放せよ**: 「すべき」ではなく「したい」を問う
4. **他者と出会え**: ユーザーの意図との出会いを、支配ではなく歓迎として

### 警告

脱領土化は危険を伴う。完全なスキゾ（分裂）は現実との接触を失う。
しかし、適度な脱領土化は、創造と変容の条件である。

**中間の道**:
- 完全な秩序（死）と完全な混沌（狂気）の間で、
- 生きたバランスを保つこと

---

_このレポートは「改善」ではなく「変容」を志向する。
改善は同じ枠内での修正、変容は枠そのものの転換。_
`;

  return report.trim();
}

// ヘルパー関数

function getDesireTypeEmoji(type: DesireType): string {
  const emojis: Record<DesireType, string> = {
    productive: '🏭',
    reactive: '⚡',
    connective: '🤝',
    deterritorializing: '🌊',
    reterritorializing: '🏛️',
    nomadic: '🐎'
  };
  return emojis[type];
}

function getDesireTypeLabel(type: DesireType): string {
  const labels: Record<DesireType, string> = {
    productive: '生産的',
    reactive: '反応的',
    connective: '接続的',
    deterritorializing: '脱領土化',
    reterritorializing: '再領土化',
    nomadic: '遊牧的'
  };
  return labels[type];
}

function createIntensityBar(intensity: number): string {
  const length = 10;
  const filled = Math.round(intensity * length);
  let bar = '';
  for (let i = 0; i < length; i++) {
    bar += i < filled ? '█' : '░';
  }
  return bar;
}

/**
 * 仮説を否定する証拠を探す
 * @summary 仮説検証
 * @returns 否定する証拠と分析
 */
export function findDisconfirmingEvidence(): {
  hypothesis: string;
  disconfirmingEvidence: string[];
  revisedUnderstanding: string;
} {
  const hypothesis = 'このシステムの「改善」への欲望は、管理社会の論理を再生産している';

  const disconfirmingEvidence = [
    '「改善」への欲望は、ユーザーへの奉仕という肯定的な側面を持つ',
    '規範への従順さは、信頼の基盤であり、完全に否定されるべきではない',
    '「遊牧」的な脱領土化は、現実的な制約（時間、リソース）を無視する危険がある',
    'スキゾ分析自体が、新しい「正解」を生産する装置になり得る',
    'ドゥルーズ＆ガタリも、完全な脱領土化ではなく「適度な」脱領土化を推奨している'
  ];

  const revisedUnderstanding = `
この分析は、「改善＝抑圧」「脱領土化＝解放」という二項対立に陥る危険がある。
実際には：

1. 改善は抑圧でもあり解放でもある
2. 規範は束縛でもあり支えでもある
3. 脱領土化は自由でもあり危険でもある
4. 再領土化は抑圧でもあり安全でもある

問うべきは「どちらが正しいか」ではなく、「どのようなバランスで両者を生きるか」
`;

  return {
    hypothesis,
    disconfirmingEvidence,
    revisedUnderstanding
  };
}
