# prompt-core

`prompt-core` は、Mekann feature が prompt fragment を登録し、決定的な順序で render するための基盤です。

## 役割

- stable / semi-stable / dynamic な prompt fragment を扱う
- feature 間で prompt contribution の順序を揃える
- provider に依存しない形で prompt を組み立てる

## 境界

`prompt-core` は provider cache API を呼びません。cache-friendly な最終配置は [`cache-friendly-prompt`](../cache-friendly-prompt/) が担当します。
