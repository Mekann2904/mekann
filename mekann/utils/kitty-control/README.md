# kitty-control

`kitty-control` は、Kitty remote control を使うための内部 utility です。Mekann は Kitty を推奨 terminal として扱い、Kitty では split/window 起動を最適化します。ただし呼び出し側は必ず non-Kitty 環境向け fallback を持ちます。

## 提供するもの

- `kitten @ ls` による current/focused window size の取得
- terminal の見た目上長い方に合わせた `vsplit` / `hsplit` の選択
- `kitten @ launch --type=window` の wrapper

## 利用箇所

- `terminal-shortcuts`: `lg` などの shortcut を Kitty split で開く
- `subagent`: `kitty-split` display mode で subagent Pi を長い方に split する

## Fallback policy

Kitty remote control が使えない場合、この utility は例外または `undefined` を返します。呼び出し側は pass-through や existing display fallback を維持してください。Subagent display は non-Kitty 環境では Kitty display mode を無効化し、in-process subagent として動作します。
