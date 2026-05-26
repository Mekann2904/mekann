# Deep Modules

このファイルは TDD skill 内で使う短い excerpt です。architecture 語彙の正本は [`../improve-codebase-architecture/LANGUAGE.md`](../improve-codebase-architecture/LANGUAGE.md) です。用語を変更するときは正本を先に更新してください。

## TDD で使う最小語彙

- **Module** — interface と implementation を持つもの。
- **Interface** — caller と test が知る必要のある全て。型だけでなく、不変条件・順序・error mode も含む。
- **Implementation** — module の内側。
- **Depth** — interface から得られる leverage。小さい interface の裏に多くの behaviour があるほど deep。
- **Deep** — small interface, substantial implementation.
- **Shallow** — interface が implementation と同じくらい複雑。
- **Seam** — interface が置かれる場所。test は seam を越えて module を使う。
- **Adapter** — seam に置かれる具体 implementation。
- **Leverage** — caller/test が小さい interface から得る能力。
- **Locality** — change, bugs, knowledge, verification が一箇所に集中すること。

## TDD での使い方

Tests should cross the same **interface** as real callers. If a test needs to reach past the **interface** into the **implementation**, the **Module** is probably the wrong shape.

Ask during refactor:

- Can this **Module** expose fewer facts at its **interface**?
- Can this **Module** hide more behaviour in its **implementation**?
- Does this **seam** have real variation? Remember: one **adapter** = hypothetical seam; two **adapters** = real seam.
- Does the change improve **leverage** for callers and **locality** for maintainers?
