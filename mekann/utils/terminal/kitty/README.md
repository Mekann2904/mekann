# terminal/kitty

`terminal/kitty` は、Kitty remote control を使うための terminal emulator adapter です。Mekann は Kitty を推奨 terminal として扱い、Kitty では split/window 起動を最適化します。feature code は原則としてこの adapter を直接操作せず、`utils/terminal` の emulator 非依存 API を使います。

## 提供するもの

- `kitten @ ls` による current/focused window size の取得
- terminal の見た目上長い方に合わせた `vsplit` / `hsplit` の選択
- `kitten @ launch --type=window` の wrapper

## 利用箇所

- `terminal-shortcuts`: `lg` などの shortcut を external split UI として開く
- `subagent`: `kitty-split` display mode で subagent Pi を長い方に split する

## Fallback policy

Kitty remote control が使えない場合、この adapter は例外または `undefined` を返します。呼び出し側は feature safety constraints と supported placements を守り、必要に応じて pass-through や existing display fallback を選びます。OpenTUI を Pi の current TTY 上へ fallback 起動してはいけません。
