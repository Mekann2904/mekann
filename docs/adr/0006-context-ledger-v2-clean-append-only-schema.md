# Context ledger v2 uses a clean append-only event schema

Mekann の context-ledger v2 は、v1 event との互換読み取りを持たず、`.pi/mekann-context/events.v2.jsonl` に新しい append-only event schema を保存する。既存 v1 log (`events.jsonl`) は runtime から読み書きせず、v2 有効時の初回 session start で `events.jsonl.bak` へアーカイブする（issue #96）。データは破棄せず保全しつつ `.bak` 拡張子で legacy であることを明示し、読者が v1 を現役の log と誤認するのを防ぐ。runtime が v1 path を読み書きすることはない。保存 schema には forward relation (`supersedes`, `resolves`, `invalidates`) のみを持たせ、現在状態は projection の `effectiveStatus` として計算する。session continuity の既存 data 保持よりも、schema の単純さ、因果関係の明確さ、restore policy の品質を優先するため。
