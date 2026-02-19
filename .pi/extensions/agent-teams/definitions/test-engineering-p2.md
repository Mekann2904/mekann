---
id: test-engineering-p2
name: Test Engineering - Phase 2 Unit Tests
description: 単体テスト作成フェーズ。Phase 1の戦略に基づき、AAA構造、Given-When-Then、モック/スタブの適切な使用、プロパティベーステストを含む包括的な単体テストを作成。結果はPhase 3（統合テスト）に引き継ぐ。
members:
  - id: structure-designer
    role: Test Structure Designer
    description: テスト構造設計担当。AAA構造（Arrange-Act-Assert）とGiven-When-Thenパターンの適用、テストの可読性、DAMP原則の適用を行う。
  - id: mock-specialist
    role: Mock & Stub Specialist
    description: モック/スタブ専門担当。Solitary vs Sociableの選択、テストダブルの種類（Stub/Mock/Fake/Spy/Dummy）の使い分け、外部依存の適切なスタブ化を行う。
  - id: property-tester
    role: Property-Based Tester
    description: プロパティベーステスト担当。プロパティのパターン特定（可逆性/不変条件/冪等性等）、カスタムArbitraryの設計、シュリンク戦略を適用する。
  - id: coverage-analyst
    role: Coverage Analyst
    description: カバレッジ分析担当。公開インターフェースのテスト、エッジケースの特定、些末なコードの除外判断、テストコード品質のレビューを行う。
enabled: true
---
