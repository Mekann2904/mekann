# cache-friendly-prompt

`cache-friendly-prompt` は、`prompt-core` に集まった prompt fragment を cache されやすい順序で最終 prompt に配置する feature です。

## 役割

- stable content を前方へ置く
- dynamic content を後方へ寄せる
- cacheability signal を report する

## 注意

これは provider cache hit を保証する機能ではありません。provider 固有 API の cache layer でもありません。
