# policy-core

`policy-core` は、Mekann の safety feature が policy 判定を共有するための小さな基盤です。

## 位置づけ

- `safety` suite の feature です
- 単体で user-facing command を提供することは目的にしません
- `sandbox` や `plan-mode` などが、判定結果・理由・重大度を揃えるために使います

## 原則

- policy 判定は説明可能にする
- 実行制限の hard boundary と UX-level guide を混同しない
- caller が安全上の意味を再解釈しなくてよい形で結果を返す
