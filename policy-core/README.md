# Policy Core

plan-mode と sandbox 拡張間で共有するポリシー語彙と bash コマンド intent 分類。
**sandbox mode 型・parsing・label の単一定義点 (single source of truth)。**

## 構成

| ファイル | 内容 |
|---------|------|
| `modes.ts` | `SandboxMode` 型、`DEFAULT_SANDBOX_MODE`、`parseSandboxMode()`、`modeLabel()`、`PLAN_MODE_TOOLS`、inter-extension event 型 |
| `commandIntent.ts` | bash コマンドの intent 分類 (`classifyCommandIntent`, `isPlanReadOnlyCommandIntent`) — UX filter |
| `capabilities.ts` | capability profile の共通定義 (`plan_read_only`, `sandbox_read_only`, `workspace_write`, `yolo`)、`profileToSandboxMode()` |

## 設計原則

- **policy-core が mode の単一定義点**: `SandboxMode` 型、`parseSandboxMode()`、`modeLabel()` はここでのみ定義される。`sandbox/permissions.ts` は re-export のみ。
- **command intent は UX filter**: `classifyCommandIntent()` は security boundary ではなく、plan workflow 上の UX filter。
- **security boundary は sandbox**: 実際の bash 実行制限は sandbox 拡張の OS-level Seatbelt policy が担当。
- **profileToSandboxMode() が唯一の mapping 経路**: profile → sandbox mode の変換はこの関数のみで行う。手動 switch は使わない。
