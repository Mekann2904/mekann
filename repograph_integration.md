# RepoGraph Integration Summary

RepoGraph論文（https://arxiv.org/abs/2412.14601）に基づくSWE-benchで+32.8%の改善を達成したRepoGraphモジュールを統合しました

詳細は: research.md

実装完了。詳細な計画は plan.md

作成されたファイル一覧:
| ファイルパス | 説明 |
|------|---------------------------------------------------------------| |----------|
| **P1: tree-sitter統合** | `.pi/extensions/search/tree-sitter/loader.ts`<br/>`.pi/extensions/search/tree-sitter/index.ts` | tree-sitter初期化・グラマーロ読 |
| `.pi/extensions/search/repograph/types.ts` | RepoGraph型定義（RepoGraphNode, RepoGraphEdge, RepoGraphIndex） |
| `.pi/extensions/search/repograph/parser.ts` | ASTパーサー（def/ref抽出、標準ライブラリフィルタリング） |
| `.pi/extensions/search/repograph/builder.ts` | グラフ構築（インクリメンタル更新対応） |
| `.pi/extensions/search/repograph/storage.ts` | インデックスの永続化（save/load/stale check） |
| `.pi/extensions/search/repograph/query.ts` | グラフクエリ（シンボル/ファイル/定義/参照検索） |
| `.pi/extensions/search/repograph/egograph.ts` | k-hopエゴグラフ抽出（キーワードマッチ、グラフ要約) |
| `.pi/extensions/search/repograph/index.ts` | 公開API |
| `.pi/extensions/search/tools/repograph_index.ts` | `repograph_index`, `repograph_query` ツール実装 |
| `.pi/extensions/search/tools/search_repograph.ts` | `search_repograph` ツール実装（未登録、search/index.tsに参照) |
| `.pi/extensions/repograph-localization/index.ts` | フレームワーク統合拋 `repograph_localize` ツール、 `extractKeywords`関数 | キーワード抽出
 `enrichContext`関数 | コンテキスト拡張
 | サブエージェント/エージェントチームへの自動フック |

| `.pi/skills/repograph-localization/skill.md` | スキル定義ファイル |

## チーム定義へのスキル追加
| チーム | スキル |
|------|-------|-------|
| core-delivery | `repograph-localization` |
| bug-war-room | `repograph-localization` |
| refactor-migration | `repograph-localization` |
| research | `repograph-localization` |
| test-engineering | `repograph-localization` |

## 残タスク
- テストコード作成
- call_graphのASTベースへの置き換え（オプション）
- フレームワーク統合のフックを安定化
- 他のチームへのスキル追加（手動対応）

