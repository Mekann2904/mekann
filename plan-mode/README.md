# Plan Mode Extension

Codex-inspired plan mode — 実装前に考えさせるための読み取り専用モード。

plan は **テキストコンテキスト** です。Todo ではありません。
システムは plan を解析・進捗管理せず、実行時の追加コンテキストとして渡すだけです。

## 挙動

```
main で /plan → plan mode に入る（読み取り専用）
plan で /plan → plan を実行して main に戻る
plan に pendingPlan がない場合 → そのまま main に戻る（キャンセル）
```

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | トグル: main ↔ plan |

## Shortcuts

| Shortcut | Description |
|----------|-------------|
| `Ctrl+Alt+P` | `/plan` と同じ |

## CLI Flag

```bash
pi --plan  # プランモードで起動
```

## Mode

| Mode | Tools | Description |
|------|-------|-------------|
| `main` | All | 通常モード |
| `plan` | read-only (read, grep, find, ls) | 調査と計画のみ |

## State

```ts
type Mode = "main" | "plan";

interface PlanState {
  mode: Mode;
  pendingPlan?: string;      // <proposed_plan> の中身
  savedActiveTools?: string[]; // plan mode 进入時の元 tools
}
```

## Workflow

1. `/plan` で plan mode に入る（ツールが read-only になる）
2. Agent がコードを調査し、`<proposed_plan>` で計画を提示
3. `/plan` で plan mode を抜け、plan が実行プロンプトとして main に注入される

## Bash Restrictions in Plan Mode

`bash` はデフォルトで無効。読み取り専用コマンドのみ許可。
パイプ・コマンド置換・チェーン（`&&`, `||`, `;`, `|`）はすべてブロック。

## Architecture

```
plan-mode/
├── index.ts           # 拡張機能エントリポイント
├── state.ts           # 最小状態管理（Mode, PlanState）
├── utils.ts           # isSafeCommand, extractProposedPlan, loadPrompt 等
├── prompts/
│   ├── plan-mode.md   # plan mode システムプロンプト
│   └── plan-mode-reminder.md # plan mode 継続中プロンプト
└── plan-mode.test.ts  # テストスイート
```

## Testing

```bash
cd plan-mode
npm test
```
