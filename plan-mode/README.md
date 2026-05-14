# Plan Mode Extension

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

plan は **テキストコンテキスト** です。Todo ではありません。
システムは plan を解析・進捗管理せず、実行時の追加コンテキストとして渡すだけです。

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | トグル: main ↔ plan |
| `/plan-model status` | 現在のモデル設定を表示 |
| `/plan-model main [provider/modelId]` | main mode 用モデルを設定（引数なし = 現在のモデルを保存） |
| `/plan-model plan [provider/modelId]` | plan mode 用モデルを設定（引数なし = 現在のモデルを保存） |
| `/plan-model clear main\|plan\|all` | モデル設定を削除 |

## Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Cmd+P` (`super+p`) | `/plan` と同じ |

## CLI Flag

```bash
pi --plan  # プランモードで起動
```

## Modes

| Mode | Tools | Description |
|------|-------|-------------|
| `main` | All | 通常モード（全ツール使用可能） |
| `plan` | read-only (`read`, `grep`, `find`, `ls`) | 調査と計画のみ |

### Bash in Plan Mode

`bash` は条件付きで許可。読み取り専用コマンドのみ実行可能。

- **許可**: `cat`, `head`, `tail`, `grep`, `ls`, `find`, `git status`, `git log`, `git diff`, `npm list`, `jq`, `rg`, `fd`, `bat` 等
- **ブロック**: `rm`, `mv`, `cp`, `npm install`, `git add`, `git commit`, `sudo`, `vim` 等
- **シェルメタ**: パイプ (`|`)、チェーン (`&&`, `||`, `;`)、コマンド置換 (`$()`)、リダイレクト (`>`) はすべてブロック
- 例外: `2>/dev/null`, `2>&1`, `>/dev/null` は読み取りコマンドに限り許可

## Mode-Specific Models

main mode と plan mode で別のモデルを使うことができます。
設定はグローバル設定ファイル `~/.pi/agent/plan-mode.json` に永続化され、セッションを超えて保持されます。

### 設定ファイル

```json
{
  "version": 1,
  "models": {
    "main": {
      "provider": "anthropic",
      "modelId": "claude-sonnet-4-5"
    },
    "plan": {
      "provider": "openai",
      "modelId": "gpt-4.1"
    }
  }
}
```

### `/model` との連携

main/plan モード中に `/model` や `Ctrl+P`（モデル循環）でモデルを変更すると、
現在のモード用設定として自動保存されます。
セッション復元時の `restore` イベントは無視されるため、意図しない上書きが起こりません。

### モード切替時の挙動

- **main → plan**: 現在のモデルを `main` に保存し、`plan` 設定があればそのモデルへ切替
- **plan → main**: `main` 設定があればそのモデルへ復元。なければ切替前のモデルにフォールバック
- **`pi --plan`**: plan mode に入った後、`plan` 設定があれば自動適用

### 例

```
# plan mode 用に Gemini Flash を設定
/plan-model plan google/gemini-2.5-flash

# main mode 用に Sonnet を設定
/plan-model main anthropic/claude-sonnet-4-5

# 現在のモデルをそのまま plan 用として保存
/plan-model plan

# 設定を確認
/plan-model status

# plan 用設定をクリア
/plan-model clear plan
```

## Workflow

```
main で /plan → plan mode に入る（ツールが read-only になる）
  ↓
Agent がコードを調査（tool_call は safety check を通過）
  ↓
Agent が <proposed_plan> で計画を提示
  ↓
plan で /plan → plan mode を抜け、plan が実行プロンプトとして main に注入される
```

- `<proposed_plan>` がない場合 → そのまま main に戻る（キャンセル扱い）
- `<proposed_plan>` が空の場合も同様にキャンセル

## State

```ts
type Mode = "main" | "plan";

interface ModelRef {
  provider: string;
  modelId: string;
}

interface PlanModeConfig {
  version: 1;
  models: {
    main?: ModelRef;
    plan?: ModelRef;
  };
}

interface PlanState {
  mode: Mode;
  pendingPlan?: string;         // <proposed_plan> の中身
  savedActiveTools?: string[];  // plan mode 进入時の元 tools（復元用）
  planPromptHash?: string;      // プロンプトのハッシュ（変更検知用）
  planPromptDelivered: boolean; // フルプロンプト配信済みフラグ
  modelConfig: PlanModeConfig;  // 永続化されたモデル設定
  savedMainModel?: ModelRef;    // plan 进入時の main モデルスナップショット
}
```

## Hooks

| Hook | Plan Mode での挙動 |
|------|-------------------|
| `session_start` | `--plan` フラグがあれば自動で plan mode に入る。モデル設定ファイルをロード |
| `tool_call` | read-only ツール以外をブロック。bash は `isSafeCommand()` で判定 |
| `before_agent_start` | プロンプト注入: 初回は `plan-mode.md`、以降は `plan-mode-reminder.md` |
| `agent_end` | 最後の assistant メッセージから `<proposed_plan>` を抽出して保存 |
| `turn_end` | ブロックカウンターをリセット |
| `model_select` | 現在のモードに応じて main/plan 設定を自動更新（`restore` は無視） |

### Tool Block Escalation

同一ツールの連続ブロック回数に応じて警告が段階的に強化:

- **1回目**: ツールと対象パスを表示。テキストでの報告を促す
- **2回目**: 再試行の無意味さを警告。`<proposed_plan>` の出力を促す
- **3回目**: 即時停止を要求。「絶対に再試行しないでください」

## Architecture

```
plan-mode/
├── index.ts           # 拡張機能エントリポイント。コマンド・ショートカット・hook 登録
├── state.ts           # 型定義と最小状態管理（Mode, PlanState, createInitialState）
├── utils.ts           # isSafeCommand, buildBlockReason, loadPrompt, hashContent, extractProposedPlan, モデル設定永続化
├── prompts/
│   ├── plan-mode.md          # plan mode 初回システムプロンプト
│   └── plan-mode-reminder.md # plan mode 継続中プロンプト
├── plan-mode.test.ts  # テストスイート（utils, state, ブロック判定, 統合シナリオ, モデル設定）
├── package.json
└── README.md
```

## Testing

```bash
npm test
```

テスト対象:

- `isSafeCommand` — 安全・危険コマンド、シェルメタ文字、リダイレクト、エッジケース
- `extractProposedPlan` — 抽出・空・複数・終了タグなし
- `buildBlockReason` — 段階的エスカレーション
- `loadPrompt` — ファイル読み込み・変数置換
- `hashContent` — 一意性・フォーマット
- `sanitizePlanTools` — edit/write 除去
- `parseModelRef` — provider/modelId パース（スラッシュ含む modelId 対応）
- `formatModelRef` / `sameModelRef` — ModelRef ユーティリティ
- Config persistence — load/save/update、round-trip、invalid JSON
- State — 初期状態・モード判定
- モード切替シミュレーション（main ↔ plan でのモデル保存・復元）
- ツールブロック判定シミュレーション
- 統合シナリオ（main → plan → 抽出 → main 実行 / キャンセル / `--plan` 起動）
