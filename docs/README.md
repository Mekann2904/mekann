# Documentation

Mekann のドキュメント入口です。初見の人は上から順に読むと、利用、設定、開発、設計判断へ進めます。

## User docs

- [Installation](./installation.md): Pi への extension 追加、依存関係、初回確認。
- [Configuration](./configuration.md): `mekann.json`、global/workspace scope、代表的な設定例。
- [Skills Guide](./skills.md): Pi-maintained skills の使い分け。
- [Terminal UI](./terminal-ui.md): Pi TUI overlay、Terminal pass-through、External split UI の整理。

## Developer docs

- [Architecture](./architecture.md): suite / feature 構成、load order、主要な設計資料。
- [Testing](../TESTING.md): test command、CI、pre-push hook。
- [Contributing](../CONTRIBUTING.md): PR、issue、ドキュメント更新、検証方針。
- [Domain docs](./agents/domain.md): `CONTEXT.md` と ADR の運用。

## Agent docs

- [Issue tracker](./agents/issue-tracker.md): GitHub issue 運用。
- [Triage labels](./agents/triage-labels.md): triage label の意味。
- [Domain docs](./agents/domain.md): agent が参照する domain doc layout。

## Reference

- [CONTEXT.md](../CONTEXT.md): project-wide glossary。
- [ADR directory](./adr/): 長く残る設計判断。
- [mattpocock-skills import policy](./vendor/mattpocock-skills.md): vendored skill の扱い。
