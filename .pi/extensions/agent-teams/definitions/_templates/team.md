---
id: template-team
name: "[Team Name] Team"
description: "[チームの説明]。Phase 1/2/3のフェーズ分割パターンで動作するチーム。"
enabled: disabled
strategy: parallel
skills:
  - "[スキル1]"           # チーム共通スキル
members:
  - id: "[メンバー1-id]"
    role: "[メンバー1役割名]"
    description: "[メンバー1の説明]"
    enabled: true
  - id: "[メンバー2-id]"
    role: "[メンバー2役割名]"
    description: "[メンバー2の説明]"
    enabled: true
---

# [Team Name] Team

## チームミッション

[チームの目的と核心原則を記述]

**核心原則:** [原則を記述]

**鉄の掟:**
```
[禁止事項1]
[禁止事項2]
```

## Phase構成

このチームは以下のフェーズ別チームと連携して動作します：

- **Phase 1 (template-p1)**: [Phase 1の説明]
- **Phase 2 (template-p2)**: [Phase 2の説明]
- **Phase 3 (template-p3)**: [Phase 3の説明]

## When to Use

以下のタスクで使用する:
- [使用場面1]
- [使用場面2]

## ディレクトリ構造

```
.pi/extensions/agent-teams/definitions/[team-name]/
├── team.md     # このファイル（統合チーム）
├── p1.md       # Phase 1チーム
├── p2.md       # Phase 2チーム
└── p3.md       # Phase 3チーム
```

## 注意事項

詳細な手順とガイドラインは各フェーズ別チーム（p1, p2, p3）を参照してください。
