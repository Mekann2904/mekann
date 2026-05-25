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
- agent が idle でない場合は agent に送らず、何もしません。
- 成功時は Pi TUI に自動復帰します。
- 起動失敗や非 0 exit code の場合だけ、terminal 側で Enter 待ちします。
- session entry、agent context、Pi notification は作りません。

## 追加 shortcut

環境変数 `MEKANN_TERMINAL_SHORTCUTS` で shell-mode shortcut を追加・上書きできます。

```bash
MEKANN_TERMINAL_SHORTCUTS='vi=nvim .,fz=fzf' pi
```

環境変数由来の shortcut は shell 経由で実行されます。built-in shortcut は安定性のため argv mode で直接起動します。

## 設計メモ

設計判断は [ADR 0009](../../../docs/adr/0009-terminal-shortcuts-are-user-owned-terminal-escapes.md) を参照してください。
