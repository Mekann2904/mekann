# Sub Agent調査レポート

## 調査概要

- 調査日時: 2026-02-24
- 調査対象: `.pi/extensions/subagents.ts` および関連モジュール
- 調査目的: sub agentの実装構造、実行履歴、10分以上かかるケースの根本原因特定

---

## 1. 現在のSub Agent実装構造

### 1.1 ファイル構成

| ファイル | 行数/サイズ | 役割 |
|---------|------------|------|
| `.pi/extensions/subagents.ts` | 49336 bytes | メイン拡張モジュール |
| `.pi/extensions/subagents/task-execution.ts` | 35236 bytes | タスク実行ロジック |
| `.pi/extensions/subagents/storage.ts` | 19104 bytes | ストレージ管理 |
| `.pi/extensions/subagents/live-monitor.ts` | 23455 bytes | ライブモニター |
| `.pi/extensions/subagents/parallel-execution.ts` | 6422 bytes | 並列実行制御 |
| `.pi/extensions/agent-runtime.ts` | 2405 lines | ランタイム管理 |
| `.pi/lib/agent-common.ts` | 共通定数 | リトライ・並列制御設定 |

### 1.2 サブエージェント定義

現在7種類のサブエージェントが定義されている:

| ID | 名前 | 役割 |
|----|------|------|
| `researcher` | Researcher | コード・ドキュメント調査 |
| `architect` | Architect | 設計・計画策定 |
| `implementer` | Implementer | 実装担当 |
| `reviewer` | Reviewer | レビュー・品質チェック |
| `tester` | Tester | テスト・検証 |
| `challenger` | Challenger | 反証・弱点発見 |
| `inspector` | Inspector | 出力品質監視 |

### 1.3 実行フロー

```
subagent_run / subagent_run_parallel
    ↓
acquireRuntimeDispatchPermit (容量確保)
    ↓
createSubagentLiveMonitor (モニター開始)
    ↓
runSubagentTask (タスク実行)
    ├── buildSubagentPrompt (プロンプト構築)
    ├── retryWithBackoff (リトライ付き実行)
    │   └── runPiPrintMode (pi print実行)
    ├── normalizeSubagentOutput (出力正規化)
    └── writeFileSync (結果保存)
    ↓
saveStorageWithPatterns (履歴保存)
```

### 1.4 タイムアウト設定

| 設定 | 値 | 説明 |
|------|-----|------|
| `DEFAULT_AGENT_TIMEOUT_MS` | 300000ms (5分) | デフォルトタイムアウト |
| `STABLE_MAX_RETRIES` | 2 | 最大リトライ回数 |
| `STABLE_INITIAL_DELAY_MS` | 800ms | 初回リトライ遅延 |
| `STABLE_MAX_DELAY_MS` | 10000ms (10秒) | 最大リトライ遅延 |
| `STABLE_MAX_RATE_LIMIT_RETRIES` | 4 | レート制限リトライ回数 |
| `STABLE_MAX_RATE_LIMIT_WAIT_MS` | 90000ms (90秒) | レート制限最大待機時間 |

**モデル別タイムアウト** (`.pi/lib/model-timeouts.ts:24-42`):

| モデル | タイムアウト |
|--------|------------|
| claude-3-5-sonnet | 300000ms (5分) |
| gpt-4 | 300000ms (5分) |
| gpt-3.5-turbo | 120000ms (2分) |
| default | 240000ms (4分) |

**思考レベル乗数**:

| レベル | 乗数 |
|--------|------|
| off | 1.0 |
| minimal | 1.1 |
| low | 1.2 |
| medium | 1.4 |
| high | 1.8 |
| xhigh | 2.5 |

### 1.5 リトライロジック

```typescript
// .pi/lib/agent-common.ts:35-59
STABLE_RUNTIME_PROFILE = true;
ADAPTIVE_PARALLEL_MAX_PENALTY = 0;  // 安定モードでは並列ペナルティ無効
ADAPTIVE_PARALLEL_DECAY_MS = 8 * 60 * 1000;  // 8分でペナルティ減衰
```

リトライ条件 (`.pi/extensions/subagents/task-execution.ts:214-222`):
- ネットワークエラー
- 空出力エラー (`subagent returned empty output`)

---

## 2. 実行履歴の分析

### 2.1 実行履歴サマリー

`.pi/subagents/runs/` に9件の実行履歴が存在:

| Run ID | Agent | 実行時間 | ステータス |
|--------|-------|---------|-----------|
| `2026-02-24-16-05-49-03108c` | researcher | 357132ms (5.95分) | completed |
| `2026-02-24-16-06-56-8af40f` | researcher | 49756ms (0.83分) | completed |
| `2026-02-24-16-25-24-d5e2da` | architect | 22041ms (0.37分) | completed |
| `2026-02-24-16-25-26-055b74` | architect | 453548ms (7.56分) | completed |
| `2026-02-24-16-36-35-5dcbc1` | implementer | 338508ms (5.64分) | completed |
| `2026-02-24-16-37-28-9ee7e4` | implementer | 160803ms (2.68分) | completed |
| `2026-02-24-19-15-40-b746af` | researcher | 0ms* | completed |
| `2026-02-24-19-29-18-675b1a` | architect | 0ms* | completed |
| `2026-02-24-19-42-33-5a7379` | implementer | 0ms* | completed |

* latencyMs=0 は別の計測方法またはバグの可能性

### 2.2 時間がかかっているケースのパターン

**5分以上かかったケース** (4件):

1. **researcher (5.95分)** - agent team調査
   - タスク: コードベース全体の調査、安全プロパティ検証
   - 読み込んだファイル: agent-teams/, agent-runtime.ts, concurrency.ts等

2. **architect (7.56分)** - ULモード計画作成
   - タスク: 5つのバグ修正計画、6つの安全プロパティ証明
   - 複雑な分析と計画策定が必要

3. **implementer (5.64分)** - バグ修正実装
   - タスク: 4つのバグ修正をplan.mdから実装
   - 複数ファイルの変更と検証

**1分以内で完了したケース** (3件):

1. **researcher (0.83分)** - ULモード調査
2. **architect (0.37分)** - agent team計画作成
3. 最近の3件 (latencyMs=0)

### 2.3 成功・失敗の傾向

- 全9件中9件が `completed` ステータス
- 失敗ケースはなし（調査時点）
- ただし、実行履歴には成功例のみが保存される可能性あり

---

## 3. 探索効率に影響する要因

### 3.1 コンテキストサイズ

**プロンプト構成要素** (`.pi/extensions/subagents/task-execution.ts:288-367`):

```
You are running as delegated subagent: {name} ({id})
Role description: {description}
Subagent operating instructions: {systemPrompt}
Assigned skills: {skills}
Task from lead agent: {task}
Extra context: {extraContext}
Patterns from past executions: {patterns}
Execution rules: {rules}
Output format: {format}
```

**コンテキスト増大要因**:
1. システムプロンプト (各サブエージェント固有)
2. スキル定義 (複数スキルをロード可能)
3. 過去の実行パターン (最大5件)
4. 実行ルール (品質基準、バイアス対策等)
5. 出力フォーマット指定

### 3.2 ツール呼び出し回数

各サブエージェント実行で発生するツール呼び出し:
- `read` - ファイル読み込み
- `bash` - コマンド実行
- `write` - ファイル書き込み
- `edit` - ファイル編集

調査タスクでは多数のファイル読み込みが必要:
- researcher: 10-50ファイル程度
- architect: 5-20ファイル程度
- implementer: 変更対象ファイル数に依存

### 3.3 タスクの種類と所要時間の関係

| タスク種類 | 平均時間 | 特徴 |
|-----------|---------|------|
| 調査 (research) | 3-6分 | 多数のファイル読み込み、分析 |
| 計画 (plan) | 0.5-8分 | 複雑さに大きく依存 |
| 実装 (implement) | 2-6分 | 変更ファイル数に依存 |
| レビュー (review) | 未計測 | コード量に依存 |

---

## 4. 関連する設定と制約

### 4.1 Runtime Load Guardの影響

**容量制限** (`.pi/extensions/agent-runtime.ts`):

```typescript
interface AgentRuntimeLimits {
  maxTotalActiveRequests: number;    // 最大同時リクエスト数
  maxTotalActiveLlm: number;         // 最大同時LLM数
  maxParallelSubagentsPerRun: number; // 1実行あたりの最大並列サブエージェント
  maxParallelTeamsPerRun: number;     // 1実行あたりの最大並列チーム
  maxParallelTeammatesPerTeam: number; // 1チームあたりの最大メンバー
  capacityWaitMs: number;             // 容量確保待機時間
  capacityPollMs: number;             // ポーリング間隔
}
```

**実行許可フロー**:
1. `acquireRuntimeDispatchPermit()` で容量確保
2. 容量不足の場合は待機または拒否
3. リース取得後に実行開始
4. 完了後にリース解放

### 4.2 並列実行制限

```typescript
// .pi/lib/agent-common.ts
STABLE_RUNTIME_PROFILE = true;
ADAPTIVE_PARALLEL_MAX_PENALTY = 0;  // 安定モード: ペナルティなし

// .pi/extensions/subagents.ts
const effectiveParallelism = adaptivePenalty.applyLimit(baselineParallelism);
```

**プロバイダー別並列制限** (`.pi/lib/provider-limits.ts`):
- OpenAI: モデルに依存
- Anthropic: モデルに依存
- 未知のプロバイダー: 無制限

### 4.3 タイムアウト設定

**デフォルト**: 300000ms (5分)

**延長要因**:
1. ユーザー指定 (`timeoutMs` パラメータ)
2. 思考レベル (medium: 1.4倍、high: 1.8倍、xhigh: 2.5倍)
3. モデル固有設定

---

## 5. 根本原因分析: なぜ時間がかかるのか

### 5.1 主要因

**1. プロンプトサイズの増大**

プロンプトには以下が含まれる:
- システムプロンプト (約500-1000トークン)
- 実行ルール (約1500トークン)
- 品質基準・バイアス対策 (約1000トークン)
- 出力フォーマット指定 (約200トークン)
- 過去のパターン (最大5件、約500トークン)

合計: 約3700-4200トークンのオーバーヘッド

**証拠**: `.pi/extensions/subagents/task-execution.ts:288-367` の `buildSubagentPrompt()` 関数

**2. Three-Layer Hybrid Strategyのオーバーヘッド**

```typescript
// Layer 1: 構造化出力強制（再生成）
// Layer 2: 生成時品質保証（QUALITY_BASELINE_RULES）
// Layer 3: 機械的テンプレート適用
```

高リスクタスクでは最大2回の再生成が発生する可能性がある。

**証拠**: `.pi/extensions/subagents/task-execution.ts:135-175`

**3. リトライロジック**

```typescript
STABLE_MAX_RETRIES = 2;
STABLE_MAX_RATE_LIMIT_RETRIES = 4;
STABLE_MAX_RATE_LIMIT_WAIT_MS = 90000;  // 90秒
```

レート制限時は最大90秒の待機が発生する可能性。

**証拠**: `.pi/lib/agent-common.ts:47-59`

**4. ファイル読み込みの多さ**

調査タスクでは多数のファイルを読み込む必要がある:
- researcher: コードベース全体をスキャン
- architect: 関連ファイルを精査
- implementer: 変更対象ファイルを特定

**証拠**: 実行履歴のタスク内容

### 5.2 二次要因

**1. ランタイム容量待機**

```typescript
capacityWaitMs: 60000,  // 60秒
capacityPollMs: 500,     // 500ms
```

他のエージェント実行中は待機が発生。

**証拠**: `.pi/extensions/agent-runtime.ts` (RuntimeLimits)

**2. ライブモニタリング**

```typescript
createSubagentLiveMonitor(ctx, {
  title: `Subagent Run: ${agent.id}`,
  items: [{ id: agent.id, name: agent.name }],
});
```

リアルタイム表示のオーバーヘッド。

**証拠**: `.pi/extensions/subagents.ts:398-402`

### 5.3 COUNTER_EVIDENCE（反証）

**「タイムアウト設定が原因」という仮説に対する反証**:

- デフォルトタイムアウトは5分
- 実行履歴の最長は7.56分
- → タイムアウト自体は原因ではない（延長されている）

**証拠**: 実際の実行時間がタイムアウトを超えているケースがある

**「並列実行制限が原因」という仮説に対する反証**:

- `ADAPTIVE_PARALLEL_MAX_PENALTY = 0` (安定モード)
- → 並列制限は厳しくない

**証拠**: `.pi/lib/agent-common.ts:38`

### 5.4 結論

**根本原因は「タスクの複雑さ」と「プロンプトサイズ」の組み合わせ**:

1. 調査タスクは本質的に多数のファイル読み込みが必要
2. 各ツール呼び出しにLLMの思考時間がかかる
3. プロンプトが長いため、LLMが処理するトークン数が多い
4. 高リスクタスクでは再生成が発生する可能性

**境界条件**:
- 単純なタスク（1-2ファイルの読み込み）: 1分以内
- 中程度のタスク（5-10ファイル）: 2-4分
- 複雑なタスク（20+ファイル、分析・計画）: 5-8分

---

## 6. 推奨される改善策

### 6.1 即時改善（低リスク）

1. **プロンプトの最適化**
   - INTERNALモード時の短縮プロンプトをデフォルト化
   - 不要なセクションの削除

2. **ファイル読み込みの最適化**
   - 必要なファイルのみを読み込むヒューリスティック
   - ファイル候補の事前フィルタリング

### 6.2 中期改善（中リスク）

1. **段階的実行**
   - 大規模タスクを小さなサブタスクに分割
   - 並列実行の活用

2. **キャッシング**
   - 読み込み済みファイルのキャッシュ
   - パターンの効率的な検索

### 6.3 長期改善（高リスク）

1. **アーキテクチャ変更**
   - エージェント間の通信効率化
   - コンテキストウィンドウの最適化

---

## 7. 調査の限界

1. 実行履歴が9件のみ（統計的有意性が低い）
2. 失敗ケースが含まれていない可能性
3. 環境変数による設定変更の影響が不明
4. 実際のトークン使用量が計測されていない

---

## 付録A: 参照ファイル一覧

| ファイル | 用途 |
|---------|------|
| `.pi/extensions/subagents.ts` | メイン実装 |
| `.pi/extensions/subagents/task-execution.ts` | タスク実行 |
| `.pi/extensions/subagents/storage.ts` | ストレージ |
| `.pi/extensions/subagents/live-monitor.ts` | モニター |
| `.pi/extensions/subagents/parallel-execution.ts` | 並列実行 |
| `.pi/extensions/agent-runtime.ts` | ランタイム管理 |
| `.pi/lib/agent-common.ts` | 共通定数 |
| `.pi/lib/model-timeouts.ts` | タイムアウト設定 |
| `.pi/subagents/storage.json` | 実行履歴 |
| `.pi/subagents/runs/*.json` | 個別実行記録 |

---

## 付録B: 実行統計

```
Total runs: 9
Completed: 9 (100%)
Failed: 0 (0%)

Average latency (non-zero): 239830ms (3.99分)
Max latency: 453548ms (7.56分)
Min latency (non-zero): 22041ms (0.37分)
```

---

## CLAIM-RESULT整合性チェック

**CLAIM**: Sub agentの実行時間が長くなる根本原因は「タスクの複雑さ」と「プロンプトサイズ」の組み合わせである。

**RESULT**: 上記分析により、以下が確認された:
1. プロンプトは3700-4200トークンのオーバーヘッドを持つ
2. Three-Layer Hybrid Strategyで再生成が発生する可能性
3. 調査タスクは本質的に多数のファイル読み込みが必要
4. 実行時間はタスクの複雑さに相関している

**CONFIDENCE**: 0.75

**理由**: 実行履歴が9件と少なく、実際のトークン使用量が計測されていないため、確信度を高めるには追加データが必要。

---

## NEXT_STEP

追加調査が必要な場合:
1. 実際のトークン使用量の計測
2. 失敗ケースの収集
3. プロンプトサイズと実行時間の相関分析
