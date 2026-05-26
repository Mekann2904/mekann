# Terminal UI implementation checklist

Mekann の terminal UI 実装では、terminal emulator の能力、UI placement、TUI framework selection を混ぜない。

## 1. 対象を分類する

まず、実装対象がどちらかを決める。

- **Terminal action**: `lg`, `zed`, `fzf` のような人間向け command。split launch に失敗した場合、action が許すなら idle 時の Terminal pass-through に fallback できる。
- **External UI feature**: OpenTUI などで作る独立 UI。External split UI capability がなければ失敗し、Terminal pass-through に fallback しない。

## 2. UI placement を決める

- **Pi TUI overlay**: Pi の active TUI 内に表示する。Pi TUI を使う。
- **Terminal pass-through**: Pi の TUI を一時停止し、current TTY を人間向け command に渡す。Pi が idle のときだけ使う。
- **External split UI**: terminal emulator が作る別 pane/window に表示する。OpenTUI を使ってよい。

## 3. TUI framework を選ぶ

- Pi TUI overlay → Pi TUI
- Terminal pass-through → none（子 command 自身が描画する）
- External split UI → OpenTUI 可

OpenTUI を Pi の current TTY 上で直接起動してはいけない。

## 4. Terminal emulator capability を確認する

terminal emulator 固有の実装は `mekann/utils/terminal/<emulator>/` に置く。

- emulator 非依存 API: `mekann/utils/terminal/types.ts`, `launch.ts`, `actions.ts`
- Kitty 固有実装: `mekann/utils/terminal/kitty/`
- iTerm2 / WezTerm などを追加する場合も同じ構造にする

feature code は Kitty / iTerm2 などの制御 command を直接組み立てず、`launchWithTerminalEmulator` または `launchExternalUi` を使う。

## 5. User launch preference を適用する

user-facing preference 名は terminal-emulator-independent にする。

例:

- `pass-through`
- `split-longer-side`
- `split-horizontal`
- `split-vertical`

優先順位:

1. feature safety constraints
2. feature supported placements
3. terminal emulator capability
4. user launch preference

User launch preference は安全制約を上書きしない。

## 6. 禁止事項

- OpenTUI を Pi の active TUI 内で起動しない
- External UI feature を Terminal pass-through に fallback しない
- feature code で Kitty 固有 command を直接組み立てない
- user-facing preference 名に `kitty-` など emulator 固有名を入れない

## 7. 関連文書

- `CONTEXT.md`: 用語集
- `docs/adr/0012-terminal-ui-placement-uses-pi-tui-in-pi-and-opentui-in-kitty-split.md`: terminal UI placement の意思決定
- `docs/adr/0009-terminal-shortcuts-are-user-owned-terminal-escapes.md`: Terminal shortcut の意思決定
