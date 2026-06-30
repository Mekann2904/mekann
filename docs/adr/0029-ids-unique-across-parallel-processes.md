# 0029. IDs and tokens are unique across parallel processes

Mekann は同一 cwd で複数の pi プロセスを並列稼働させる（CONTEXT.md 「context isolation」）。そのため ID やトークンが「タイムスタンプ + プロセスローカルカウンタ」だけだと、2 プロセスが同一ミリ秒に立ち上がった瞬間に `<prefix>_<同時刻>_0` が衝突し、artifact / candidate / reservation を互いに静かに上書きする。また `Math.random()` 由来のトークンは予測可能なため、悪意ある拡張が sandbox override token を偽造して他モードの sandbox profile を不正に pop できる危険があった（issue #144）。

全ての ID/トークン生成は暗号学的乱数ベースの単一ヘルパ `mekann/utils/id.ts` を通し、「並列プロセスで一意」かつ「予測不能」を一箇所で保証する。

## Status

Accepted

## Context

issue #144 の探索 (IC-015 / IC-044 / IC-157 / IC-145) で、複数箇所が衝突/予測可能な ID 生成を持っていた。

- **output-gate** `store.ts` `nextArtifactId` — `og_<time>_<counter>` のみ。同一 ms に 2 プロセスで `og_<同時刻>_0` が衝突。ledger だけが `crypto.randomBytes(3)` 付きで安全側だった。
- **autoresearch candidate** `candidate.ts` `nextCandidateId` — プロセスローカル `counter` のみ。候補作成で同 ID を振り `writeCandidate` が互いに上書き。
- **subagent registry** `registry.ts` `reservationCounter` — 予約トークンがプロセスローカル連番。
- **modes** `index.ts` `readOnlySandboxOverrideToken` — `Math.random()`（暗号学的でない）ベース。トークン予測/偽造で他モードの sandbox profile を不正 pop されるリスク。
- **image-worker-pool** `index.ts` `taskId: Date.now()` — 同一 ms 内衝突。

各モジュールが個別に `crypto.randomBytes(...)` を呼ぶ修正も可能だが、乱数長や符号化がばらつき、将来の追加箇所で再び衝突が紛れ込む。方針と実装を単一ヘルパに集約し、「ID は並列プロセスで一意」を機械的に保証する。

## Decisions

- **単一ヘルパ `mekann/utils/id.ts`** を新設し、すべての ID/トークン生成を集約する。
  - `createSequentialId(prefix, createdAt, counter, random?)` — `<prefix>_<time-base36>_<counter-base36>`(+ `_<random>`)。`random` 省略時は legacy 2-segment 形式を返し、既存の `createXxxId(time, counter)` 呼び出しと形式アサーションを維持する。
  - `randomIdSuffix(bytes = 3)` — `crypto.randomBytes(bytes).toString("hex")`。3 バイト(24 bit)は ledger 実績値。counter + timestamp との組み合わせで並列プロセス間の実衝突確率は無視できる。
  - `randomToken(bytes = 16)` — 能力を伴う不透明トークン（sandbox override / reservation）。予測不能かつ一意。
- **形状は ledger の「安全側」`ctx_<time>_<counter>_<rand>` に統一**（ADR-0006）。timestamp + counter でプロセス内の順序と可読性を保ちつつ、暗号学的乱数 suffix で並列プロセス衝突を除去する。
- **`nextXxxId` が乱数を付与し、`createXxxId(time, counter)` は乱数なしの 2-segment を返す**。これにより `createXxxId` の公開 API と既存テスト（`createEventId(123456789, 35)` 等）は変更不要。
- **ID 検証正規表現は `_<rand>` セグメントをオプション許容**に緩和する（例: `/^og_[a-z0-9]+_[a-z0-9]+(_[a-z0-9]+)?$/`）。これにより既存のディスク上データ（2-segment ID）と新形式（3-segment）の両方を読み取れる。
- **sandbox override token は必ず `randomToken()`**（暗号学的）。`Math.random()` 由来を廃止し、トークン偽造による他モード profile の不正 pop を防ぐ。

## Considered Options

- **各モジュールで個別に `crypto.randomBytes` を呼ぶ**: 乱数長・符号化がばらつき、将来の追加箇所で再衝突が紛れ込むため却下。単一ヘルパで機械的に保証する。
- **`crypto.randomUUID()` に全面的に切り替え**: 既存の `og_` / `arc_` / `ctx_` prefix 形式と、それを前提にする検証/抽出正規表現、ディスク上データとの互換を失う。prefix + 顺序性を残しつつ乱数 suffix を足す本案を優先する。
- **プロセスローカルカウンタを残して乱数を「2-segment 目に折りたたむ」**: 正規表現を一切変えずに済むが、候補の `[0-9]+` 制約など符号化がモジュール毎に分裂し「単一ヘルパ」の趣旨を損なう。ledger と形状を統一する本案を採用する。

## Consequences

- 新形式 ID: `og_<t>_<c>_<rand>` / `arc_<t>_<c>_<rand>` / `ctx_<t>_<c>_<rand>`（`nextXxxId` 経由）。`createXxxId(time, counter)` 直接呼び出しは従来通りの 2-segment。
- 並列プロセスで ID 生成を連続呼び出しても衝突しない（`mekann/utils/id.test.ts` で N プロセス×M 回の非衝突を検証）。
- sandbox override / reservation token が `Math.random()` 由来でなくなる。
- ID 抽出/検証を行う **同一コードパス内** の正規表現は `_<rand>` オプションを許容するよう追従済み（`store.ts` の save/read 検証、`candidate.ts` の `assertCandidateId`、サマリー往復の `outputGateSavings.ts`）。
- **別コードパスの抽出正規表現（`context/context-control/planner.ts` の `\bog_[a-z0-9]+_[a-z0-9]+\b`）は本 ADR では更新しない**。この正規表現は両端に `\b`（単語境界）を持つため、3-segment ID `og_<t>_<c>_<rand>` には **全体がマッチせず `undefined` を返す**（第 2 セグメント直後の `_<rand>` が単語境界を壊す。部分マッチでもない）。結果として新形式 artifact に対する externalize 推奨が抜け落ちるため、issue #160（IC-177）で正規表現同期として対応する。これは本 issue のスコープ（"ID 形式変更に伴う正規表現同期は後続 #160"）と整合する。
- 既存のディスク上データ（2-segment ID）は緩和した検証正規表現で引き続き読み取れるため、破壊的移行は不要。
