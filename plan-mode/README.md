# Plan Mode Extension

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

plan は **テキストコンテキスト** です。Todo ではありません。
システムは plan を解析・進捗管理せず、実行時の追加コンテキストとして渡すだけです。

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | トグル: main ↔ plan |

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
| `plan` | read-only (`read`, `grep`, `find`, `ls`, `bash`) | 調査と計画のみ |

### Bash in Plan Mode

`bash` ツールは plan mode でも表示され、読み取り専用コマンドのみ実行可能。

- **許可**: `cat`, `head`, `tail`, `grep`, `ls`, `find`, `git status`, `git log`, `git diff`, `npm list`, `jq`, `rg`, `fd`, `bat` 等
- **ブロック**: `rm`, `mv`, `cp`, `npm install`, `git add`, `git commit`, `sudo`, `vim` 等
- **シェルメタ**: パイプ (`|`)、チェーン (`&&`, `||`, `;`)、コマンド置換 (`$()`)、リダイレクト (`>`) はすべてブロック
- 例外: `2>/dev/null`, `2>&1`, `>/dev/null` は読み取りコマンドに限り許可

> **注意**: bash のコマンド intent 分類 (`classifyCommandIntent()`) は **UX フィルタ** であり、security boundary ではありません。
> 実際の強制実行は sandbox 拡張の OS-level Seatbelt policy が担当します。
> sandbox が未導入の場合、intent 分類が唯一のガードとして機能します。

## Mode-Specific Models & Thinking

main mode と plan mode で別のモデル・thinking level を使うことができます。
pi の `/model` や `Shift+Tab` で変更すると、現在のモードに応じて自動的に保存されます。
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
  },
  "thinking": {
    "main": "high",
    "plan": "xhigh"
  }
}
```

### 許可される thinking level 値

`off`, `minimal`, `low`, `medium`, `high`, `xhigh`

不正な値は読み込み時に無視されます。

### `/model` との連携

main/plan モード中に `/model` や `Ctrl+P`（モデル循環）でモデルを変更すると、
現在のモード用設定として自動保存されます。
セッション復元時の `restore` イベントは無視されるため、意図しない上書きが起こりません。

### `Shift+Tab` での thinking level 変更との連携

main/plan モード中に `Shift+Tab`（thinking level 循環）で thinking level を変更すると、
現在のモード用設定として自動保存されます。
拡張内部での復元による変更は抑制されるため、意図しない上書きが起こりません。

### モード切替時の挙動

- **main → plan**: 現在のモデルを `main` に保存し、`plan` 設定があればそのモデルへ切替。現在の thinking level を `main` に保存し、`plan` thinking 設定があれば適用
- **plan → main**: `main` 設定があればそのモデルへ復元。なければ切替前のモデルにフォールバック。`main` thinking 設定があれば適用、なければ plan 入場時の thinking level にフォールバック
- **`pi --plan`**: plan mode に入った後、`plan` 設定があれば自動適用。`main` の設定は上書きしない

### 例

```
# plan mode に入る
/plan

# plan mode 中に /model で Gemini Flash に変更 → plan 用として自動保存
/model google/gemini-2.5-flash

# plan mode 中に Shift+Tab で thinking level を変更 → plan 用として自動保存

# main に戻る
/plan
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
  thinking: {
    main?: ThinkingLevel;
    plan?: ThinkingLevel;
  };
}

interface PlanState {
  mode: Mode;
  pendingPlan?: string;         // <proposed_plan> の中身
  savedActiveTools?: string[];  // plan mode 进入時の元 tools（復元用）
  planPromptHash?: string;      // プロンプトのハッシュ（変更検知用）
  planPromptDelivered: boolean; // フルプロンプト配信済みフラグ
  modelConfig: PlanModeConfig;  // 永続化されたモデル・thinking 設定
  savedMainModel?: ModelRef;    // plan 进入時の main モデルスナップショット
  savedMainThinking?: ThinkingLevel; // plan 进入時の main thinking スナップショット
}
```

## Hooks

| Hook | Plan Mode での挙動 |
|------|-------------------|
| `session_start` | `--plan` フラグがあれば自動で plan mode に入る。モデル・thinking 設定ファイルをロード |
| `tool_call` | read-only ツール以外をブロック。bash は `classifyCommandIntent()` で UX guard 判定（security boundary は sandbox） |
| `before_agent_start` | プロンプト注入: 初回は `plan-mode.md`、以降は `plan-mode-reminder.md` |
| `agent_end` | 最後の assistant メッセージから `<proposed_plan>` を抽出して保存 |
| `turn_end` | ブロックカウンターをリセット |
| `model_select` | 現在のモードに応じて main/plan 設定を自動更新（`restore` は無視） |
| `thinking_level_select` | 現在のモードに応じて main/plan thinking 設定を自動更新（拡張内部の復元は抑制） |

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

- `isPlanReadOnlyCommandIntent` — 安全・危険コマンド、シェルメタ文字、リダイレクト、エッジケース
- `extractProposedPlan` — 抽出・空・複数・終了タグなし
- `buildBlockReason` — 段階的エスカレーション
- `loadPrompt` — ファイル読み込み・変数置換
- `hashContent` — 一意性・フォーマット
- `PLAN_MODE_TOOLS` coverage — read, grep, find, ls, bash を含む
- `parseModelRef` — provider/modelId パース（スラッシュ含む modelId 対応）
- `formatModelRef` / `sameModelRef` — ModelRef ユーティリティ
- Config persistence — load/save/update、round-trip、invalid JSON
- Thinking config persistence — round-trip、古い設定の正規化、無効値の除去
- State — 初期状態・モード判定
- モード切替シミュレーション（main ↔ plan でのモデル・thinking 保存・復元）
- ツールブロック判定シミュレーション
- 統合シナリオ（main → plan → 抽出 → main 実行 / キャンセル / `--plan` 起動）
