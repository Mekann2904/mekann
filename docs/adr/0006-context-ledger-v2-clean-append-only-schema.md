# Context ledger v2 uses a clean append-only event schema

Mekann の context-ledger v2 は、v1 event との互換読み取りを持たず、`.pi/mekann-context/events.v2.jsonl` に新しい append-only event schema を保存する。既存 v1 log は削除しないが runtime からは無視し、保存 schema には forward relation (`supersedes`, `resolves`, `invalidates`) のみを持たせ、現在状態は projection の `effectiveStatus` として計算する。session continuity の既存 data 保持よりも、schema の単純さ、因果関係の明確さ、restore policy の品質を優先するため。
