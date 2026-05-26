# terminal-shortcuts

`terminal-shortcuts` は、Pi の通常入力欄で完全一致した短い入力を agent prompt として送らず、人間向けの terminal command として起動する utility feature です。

## Built-in shortcuts

| Input | 実行される command |
|---|---|
| `lg` | `lazygit` |
| `zed` | `zed .` |
| `zed .` | `zed .` |

## 挙動

- interactive mode の通常入力だけを対象にします。
- 入力は trim 後に case-sensitive な完全一致で判定します。
- attachment がある場合でも shortcut を優先します。
- pass-through shortcut は agent が idle でない場合、agent に送らず、何もしません。
- split shortcut は Pi の current TTY を奪わないため、agent が idle でない場合でも split 起動を試します。split 起動に失敗した場合、non-idle 中は pass-through に fallback しません。
- 既定では Pi TUI を一時停止し、現在の terminal を command に渡します。
- built-in の `lg` と split 指定された shortcut は、対応 terminal emulator 上で現在の window の長い方に split pane を作って起動します。
- split が使えない場合は pass-through に fallback します。
- pass-through 成功時は Pi TUI に自動復帰します。
- pass-through で起動失敗や非 0 exit code の場合だけ、terminal 側で Enter 待ちします。
- session entry、agent context、Pi notification は作りません。

## 追加 shortcut

環境変数 `MEKANN_TERMINAL_SHORTCUTS` で shell-mode shortcut を追加・上書きできます。

```bash
MEKANN_TERMINAL_SHORTCUTS='vi=nvim .,fz=fzf' pi
```

環境変数由来の shortcut は shell 経由で実行されます。built-in shortcut は安定性のため argv mode で直接起動します。

## Launcher strategy

既定は `pass-through` です。ただし built-in の `lg` は split を試します。追加で特定 shortcut を split にしたい場合は `MEKANN_TERMINAL_SPLIT_SHORTCUTS` に comma-separated で指定します。

```bash
MEKANN_TERMINAL_SPLIT_SHORTCUTS='zed' pi
```

全 shortcut の実行方式を明示的に固定したい場合は `MEKANN_TERMINAL_STRATEGY` を使います。

```bash
MEKANN_TERMINAL_STRATEGY=pass-through pi
MEKANN_TERMINAL_STRATEGY=split-longer-side pi
```

Kitty での `split-longer-side` は `kitten @ launch` を使うため、環境によっては `kitty.conf` で remote control を有効にする必要があります。

```conf
allow_remote_control yes
```

## 設計メモ

設計判断は [ADR 0009](../../../docs/adr/0009-terminal-shortcuts-are-user-owned-terminal-escapes.md) を参照してください。
