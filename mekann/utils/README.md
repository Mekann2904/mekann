# utils suite

`utils` は、人間の作業を少し楽にする軽量な utility feature を置く suite です。

| Feature | 役割 |
|---|---|
| [`zip-repo`](./zip-repo/) | Git worktree の現在状態を ZIP 化し、macOS clipboard にコピーする |
| [`codex-limits`](./codex-limits/) | Codex (ChatGPT subscription) の使用量を表示する |
| [`dashboard`](./dashboard/) | `/dashboard` から Pi TUI dashboard を起動する |
| [`codex-web-search`](./codex-web-search/) | 現在のモデルに関わらず Codex 経由の Web 検索を使う |
| [`terminal-shortcuts`](./terminal-shortcuts/) | `lg` や `zed` の完全一致入力を agent prompt ではなく terminal command として起動する |

## Internal utilities

| Utility | 役割 |
|---|---|
| [`terminal/kitty`](./terminal/kitty/) | 推奨 terminal である Kitty の remote control を使う terminal emulator adapter |
| [`tui`](./tui/) | TUI placement と framework selection の共有ルール |

自律性・安全境界・runtime context management を担う機能は、それぞれ `autonomy` / `safety` / `context` suite に置きます。
