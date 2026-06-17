# prompt-core

`prompt-core` は、Mekann feature が prompt fragment を登録し、決定的な順序で render するための基盤です。

## 役割

- stable / semi-stable / dynamic な prompt fragment を扱う
- feature 間で prompt contribution の順序を揃える
- provider に依存しない形で prompt を組み立てる

## 境界

`prompt-core` は provider cache API を呼びません。cache-friendly な最終配置は [`cache-friendly-prompt`](../cache-friendly-prompt/) が担当します。

## 共有設定・ヘルパー

- `config.ts`: 動的コンテキスト上限を 1 箇所に集約。`DYNAMIC_FRAGMENT_BUDGET_CHARS`（render 側・個別フラグメント上限）と `DYNAMIC_TAIL_MAX_CHARS`（snapshot 側・動的末尾全体上限）。
- `volatile.ts`: base system prompt の揮発 runtime 行を抽出と検査で共通化する単一ソース（`volatileRuntimeLinePatterns`, `isVolatileRuntimeLine`, `splitVolatileLines`）。行頭 `:` アンカーで過剩抽出を回避する。
