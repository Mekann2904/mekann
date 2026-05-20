# Policy Core

plan-mode と sandbox 拡張間で共有するポリシー語彙と bash コマンド intent 分類。
**sandbox mode 型・parsing・label の単一定義点 (single source of truth)。**

## 構成

| ファイル | 内容 |
|---------|------|
| `modes.ts` | `SandboxMode` 型、`DEFAULT_SANDBOX_MODE`、`parseSandboxMode()`、`modeLabel()`、`PLAN_MODE_TOOLS`、capability profile 名、inter-extension event 型、bash コマンドの intent 分類 (`classifyCommandIntent`, `isPlanReadOnlyCommandIntent`) |

## 設計原則

- **policy-core が mode の単一定義点**: `SandboxMode` 型、`parseSandboxMode()`、`modeLabel()` はここでのみ定義される。`sandbox/permissions.ts` は re-export のみ。
- **command intent は UX filter**: `classifyCommandIntent()` は security boundary ではなく、plan workflow 上の UX filter。
- **security boundary は sandbox**: 実際の bash 実行制限は sandbox 拡張の OS-level Seatbelt policy が担当。
- **profile → sandbox mode mapping は sandbox 側で restrict-only に行う**: event override は `plan_read_only` / `sandbox_read_only` のような制限強化のみ受け付け、`workspace_write` / `yolo` への緩和は `/sandbox` command と承認フローに限定する。
