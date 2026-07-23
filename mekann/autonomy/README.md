# autonomy suite

`autonomy` は、Pi coding agent の **自律的な作業**を支える suite です。長い作業、並列調査、実験的な候補評価を扱います。

| Feature | 使う場面 |
|---|---|
| [`goal`](./goal/) | 一般目的を session/thread に保持し、予算内で継続したい |
| [`subagent`](./subagent/) | 独立調査・fresh review・patch proposal を context isolation 付きで任せたい |

`goal` を一般目的の自律継続に使用します。
