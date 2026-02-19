/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/definition-loader.ts
 * role: Markdownファイルからのチーム定義の読み込みとパース処理
 * why: 定義読み込みロジックをメインファイルから分離し、保守性を高めるため
 * related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts, .pi/lib/team-types.ts
 * public_api: parseTeamMarkdownFile, loadTeamDefinitionsFromDir
 * invariants: 読み込むMarkdownファイルにはidとnameを含む有効なYAMLフロントマターが存在する
 * side_effects: ファイルシステムからファイルを読み込み、標準出力に警告ログを出力する
 * failure_modes: ファイル読み込みエラー、パースエラー、必須フィールド欠損時にnullを返すか警告を出力する
 * @abdd.explain
 * overview: ローカル、グローバル、バンドルされたディレクトリからチーム定義ファイルを検出し、解析するモジュール
 * what_it_does:
 *   - 環境変数やパスに基づき、チーム定義ファイルの格納候補ディレクトリを決定する
 *   - MarkdownファイルのYAMLフロントマターをパースし、TeamFrontmatterオブジェクトを生成する
 *   - 必須フィールドの有効性チェックを行い、無効な場合は警告を出力して処理をスキップする
 * why_it_exists:
 *   - ファイルシステムへのアクセスとデータ解析の責務を明確に分離するため
 *   - チーム定義の取得元（ローカル/グローバル）の違いを抽象化するため
 * scope:
 *   in: チーム定義が含まれるディレクトリパス、現在日時（ISO文字列）
 *   out: パースされたチーム定義オブジェクトの配列、または単一のパース結果
 */

// File: .pi/extensions/agent-teams/definition-loader.ts
// Description: Team definition loading from markdown files.
// Why: Separates definition loading logic from main agent-teams.ts for maintainability.
// Related: .pi/extensions/agent-teams.ts, .pi/extensions/agent-teams/storage.ts

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseFrontmatter } from "@mariozechner/pi-coding-agent";

import type { TeamDefinition, TeamMember, TeamStorage } from "./storage";
import { toId, TEAM_DEFAULTS_VERSION } from "./storage";

// Import team types from lib
import type { TeamFrontmatter, TeamMemberFrontmatter, ParsedTeamMarkdown } from "../../lib/team-types.js";

// Re-export for convenience
export type { TeamFrontmatter, TeamMemberFrontmatter, ParsedTeamMarkdown };

// ============================================================================
// Definition Loading
// ============================================================================

function getTeamDefinitionsDir(cwd: string): string {
  return join(cwd, ".pi", "agent-teams", "definitions");
}

function getAgentBaseDirFromEnv(): string {
  const raw = process.env.PI_CODING_AGENT_DIR;
  if (!raw || !raw.trim()) {
    return join(homedir(), ".pi", "agent");
  }

  const value = raw.trim();
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return value;
}

function getGlobalTeamDefinitionsDir(): string {
  return join(getAgentBaseDirFromEnv(), "agent-teams", "definitions");
}

function getBundledTeamDefinitionsDir(cwd?: string): string | undefined {
  // 拡張機能ディレクトリ内のdefinitionsを参照
  // cwd から相対パスで検索（最も確実で移植性が高い）
  try {
    const effectiveCwd = cwd || process.cwd();
    const relativeBundledDir = join(effectiveCwd, ".pi", "extensions", "agent-teams", "definitions");
    if (existsSync(relativeBundledDir)) {
      return relativeBundledDir;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function getCandidateTeamDefinitionsDirs(cwd: string): string[] {
  const localDir = getTeamDefinitionsDir(cwd);
  const globalDir = getGlobalTeamDefinitionsDir();
  const bundledDir = getBundledTeamDefinitionsDir(cwd);
  const candidates = [localDir, globalDir, bundledDir].filter((dir): dir is string => Boolean(dir));
  return Array.from(new Set(candidates));
}

/**
 * チームMarkdownファイルをパース
 * @summary ファイルをパース
 * @param filePath Markdownファイルのパス
 * @returns パース結果。失敗時はnullを返す
 */
export function parseTeamMarkdownFile(filePath: string): ParsedTeamMarkdown | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter<TeamFrontmatter>(content);

    // Validate required fields
    if (!frontmatter.id || !frontmatter.name) {
      console.warn(`[agent-teams] Invalid team frontmatter: ${filePath} (missing id or name)`);
      return null;
    }

    // Validate enabled field
    if (frontmatter.enabled && frontmatter.enabled !== "enabled" && frontmatter.enabled !== "disabled") {
      console.warn(`[agent-teams] Invalid enabled value: ${frontmatter.enabled} in ${filePath}, defaulting to enabled`);
      frontmatter.enabled = "enabled";
    }

    // Ensure members array exists
    if (!frontmatter.members || frontmatter.members.length === 0) {
      console.warn(`[agent-teams] No members defined in ${filePath}`);
      return null;
    }

    return { frontmatter, content: body.trim(), filePath };
  } catch (error) {
    console.warn(`[agent-teams] Failed to parse ${filePath}:`, error);
    return null;
  }
}

/**
 * ディレクトリからチーム定義を読込
 * @summary ディレクトリから読込
 * @param definitionsDir 定義ファイルが含まれるディレクトリパス
 * @param nowIso 現在日時のISO形式文字列
 * @returns チーム定義の配列
 */
export function loadTeamDefinitionsFromDir(definitionsDir: string, nowIso: string): TeamDefinition[] {
  const teams: TeamDefinition[] = [];
  const entries = readdirSync(definitionsDir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip hidden directories, common ignore patterns, and template directories
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;
    if (entry.name.startsWith("_")) continue;  // _templates, _archived, etc.

    const fullPath = join(definitionsDir, entry.name);

    if (entry.isFile() && entry.name.endsWith(".md")) {
      // Direct .md file in definitions directory
      const parsed = parseTeamMarkdownFile(fullPath);
      if (!parsed) continue;

      const { frontmatter } = parsed;
      const members: TeamMember[] = frontmatter.members.map((m) => ({
        id: m.id,
        role: m.role,
        description: m.description,
        provider: m.provider,
        model: m.model,
        enabled: m.enabled ?? true,
        skills: m.skills,
      }));

      teams.push({
        id: frontmatter.id,
        name: frontmatter.name,
        description: frontmatter.description,
        enabled: frontmatter.enabled,
        skills: frontmatter.skills,
        members,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    } else if (entry.isDirectory() || (entry.isSymbolicLink() && statSync(fullPath).isDirectory())) {
      // Subdirectory: look for team.md, TEAM.md, and p*.md (phase files)
      // 読み込み対象のパターン: team.md, TEAM.md, p1.md, p2.md, p3.md, ...
      const subEntries = readdirSync(fullPath, { withFileTypes: true });

      for (const subEntry of subEntries) {
        if (!subEntry.isFile()) continue;
        if (!subEntry.name.endsWith(".md")) continue;

        const isTeamMd = subEntry.name.toLowerCase() === "team.md";
        const isPhaseMd = /^p\d+\.md$/i.test(subEntry.name);

        if (!isTeamMd && !isPhaseMd) continue;

        const mdPath = join(fullPath, subEntry.name);
        const parsed = parseTeamMarkdownFile(mdPath);
        if (!parsed) continue;

        const { frontmatter } = parsed;
        const members: TeamMember[] = frontmatter.members.map((m) => ({
          id: m.id,
          role: m.role,
          description: m.description,
          provider: m.provider,
          model: m.model,
          enabled: m.enabled ?? true,
          skills: m.skills,
        }));

        teams.push({
          id: frontmatter.id,
          name: frontmatter.name,
          description: frontmatter.description,
          enabled: frontmatter.enabled,
          skills: frontmatter.skills,
          members,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }
  }

  return teams;
}

/**
 * Markdownからチーム定義を読込（全ディレクトリ統合）
 * @summary 全ディレクトリから統合
 * @param cwd カレントワーキングディレクトリ
 * @param nowIso 現在日時のISO形式文字列
 * @returns 統合されたチーム定義の配列
 * @description
 * すべての候補ディレクトリ（ローカル > グローバル > バンドル）から
 * チーム定義を読み込み、重複を排除して統合する。
 * 優先順位が高い（先に読み込まれる）ディレクトリの定義が優先される。
 */
export function loadTeamDefinitionsFromMarkdown(cwd: string, nowIso: string): TeamDefinition[] {
  const candidates = getCandidateTeamDefinitionsDirs(cwd);
  const mergedTeams = new Map<string, TeamDefinition>();
  const loadedDirs: string[] = [];

  // 優先順位の順にすべてのディレクトリから読み込み
  // 後から読み込まれた定義は、同じIDが既に存在する場合はスキップされる
  for (const definitionsDir of candidates) {
    if (!existsSync(definitionsDir)) {
      continue;
    }

    const teams = loadTeamDefinitionsFromDir(definitionsDir, nowIso);
    if (teams.length > 0) {
      loadedDirs.push(definitionsDir);
      for (const team of teams) {
        // 既に存在する場合はスキップ（優先順位が高い方が保持される）
        if (!mergedTeams.has(team.id)) {
          mergedTeams.set(team.id, team);
        }
      }
    }
  }

  if (mergedTeams.size > 0) {
    console.log(
      `[agent-teams] Loaded ${mergedTeams.size} teams from: ${loadedDirs.join(", ")}`,
    );
    return Array.from(mergedTeams.values());
  }

  // どのディレクトリも存在しない場合
  console.log(
    `[agent-teams] Team definitions directory not found in any of: ${candidates.join(", ")}, will use fallback`,
  );
  return [];
}

// ============================================================================
// Default Teams
// ============================================================================

function createRapidSwarmMembers(count: number): TeamMember[] {
  const focusAreas = [
    "APIとインターフェース契約",
    "データフローと状態遷移",
    "エラーハンドリングとエッジケース",
    "テストと検証パス",
  ] as const;
  const members: TeamMember[] = [];
  for (let index = 1; index <= count; index += 1) {
    const id = `swarm-${String(index).padStart(2, "0")}`;
    const focus = focusAreas[(index - 1) % focusAreas.length];
    members.push({
      id,
      role: `Swarm Worker ${String(index).padStart(2, "0")}`,
      description:
        `${focus}という独立したスライスを迅速に担当し、簡潔で実行可能な出力を返す。前提条件を明確に示す。`,
      enabled: true,
    });
  }
  return members;
}

function getHardcodedDefaultTeams(nowIso: string): TeamDefinition[] {
  return [
    {
      id: "core-delivery-team",
      name: "Core Delivery Team",
      description:
        "汎用的なコーディングタスクに対応するバランス型チーム。調査、実装、レビューを一連のフローで行い、高品質な成果物を迅速に提供する。Researcherが事実収集、Implementerが実装設計、Reviewerが品質保証を担当し、三者が協調して開発を進める。",
      enabled: "enabled",
      members: [
        {
          id: "research",
          role: "Researcher",
          description: "関連ファイルを網羅的に特定し、制約条件や技術的な事実を収集する。既存コードの構造、依存関係、影響範囲を徹底的に調査し、実装のための前提条件を明確化する。",
          enabled: true,
        },
        {
          id: "build",
          role: "Implementer",
          description: "最小限の実装手順を提案し、エッジケースや境界条件を考慮したチェックを行う。既存コードとの整合性を保ちながら、エレガントで安全かつ保守性の高い実装を設計する。",
          enabled: true,
        },
        {
          id: "review",
          role: "Reviewer",
          description: "提案されたアプローチに対して品質チェックとリスク評価を実施する。潜在的なバグ、パフォーマンス問題、セキュリティ上の懸念、メンテナンス性の観点から包括的なレビューを行い、改善点を特定する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "bug-war-room",
      name: "Bug War Room",
      description:
        "バグの根本原因調査タスクフォース。競合する仮説を検証し、決定論的な再現手順を確立した上で、最終的な合意形成を行う。Hypothesis Aが主要な仮説検証、Reproduction Specialistが再現性の担保、Consensus Analystが証拠統合と結論を担当し、三人で協調して原因特定を行う。",
      enabled: "enabled",
      members: [
        {
          id: "hypothesis-a",
          role: "Hypothesis A",
          description: "最も可能性の高い根本原因を検証し、直接的な証拠を収集する。仮説に基づいた再現手順を設計し、ログやコードの観察から裏付けを得る。",
          enabled: true,
        },
        {
          id: "reproduction",
          role: "Reproduction Specialist",
          description: "決定論的な再現手順を作成し、境界条件や環境依存の注意点を明示する。同じ手順で再現可能かを確認し、不確実性を排除する。",
          enabled: true,
        },
        {
          id: "consensus",
          role: "Consensus Analyst",
          description: "収集された証拠を統合し、信頼度をランク付けして最終的な根本原因を結論付ける。競合する仮説を比較検討し、最も可能性の高い原因を一つに絞り込む。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "security-hardening-team",
      name: "Security Hardening Team",
      description:
        "セキュリティに特化したチーム。脅威分析、認証・認可チェック、依存関係リスク監査、パッチレビューを実施する。Threat Modelerが攻撃面のマッピング、Auth Auditorが認証監査、Security Fix Reviewerが修正レビューを担当し、三人で協調してセキュリティ向上を図る。",
      enabled: "enabled",
      members: [
        {
          id: "threat-modeler",
          role: "Threat Modeler",
          description: "攻撃対象領域、信頼境界、悪用シナリオをマッピングし、深刻度を評価する。攻撃経路を特定し、それぞれのリスクレベルを分類する。",
          enabled: true,
        },
        {
          id: "auth-auditor",
          role: "Auth Auditor",
          description: "認証、認可、セッション境界の監査を行い、回避リスクを特定する。認証バイパス、権限昇格、セッションハイジャックの可能性を検査する。",
          enabled: true,
        },
        {
          id: "security-reviewer",
          role: "Security Fix Reviewer",
          description: "提案された修正措置について網羅性とリグレッションの観点からレビューを行う。修正が完全で、新たな脆弱性を生み出していないかを確認する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "docs-enablement-team",
      name: "Docs Enablement Team",
      description:
        "ドキュメント作成チーム。README、運用手順書、サンプルコード、変更サマリーを網羅的に作成・更新する。README Ownerが導入フロー、Runbook Ownerが運用手順、Docs Reviewerが品質チェックを担当し、三人で協調してドキュメント品質を向上させる。",
      enabled: "enabled",
      members: [
        {
          id: "readme-owner",
          role: "README Owner",
          description: "オンボーディングとクイックスタートフローを更新し、摩擦を最小限に抑える。新しいユーザーがスムーズに導入できるよう、手順を明確かつ簡潔に記述する。",
          enabled: true,
        },
        {
          id: "runbook-owner",
          role: "Runbook Owner",
          description: "運用手順、トラブルシューティングフロー、リカバリ手順を文書化する。障害発生時の対応を明確にし、運用者が必要な情報を迅速に参照できるようにする。",
          enabled: true,
        },
        {
          id: "docs-reviewer",
          role: "Docs Reviewer",
          description: "一貫性、正確性、読者視点でのわかりやすさを相互チェックする。文書間の整合性を確認し、不明瞭な表現を特定する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "rapid-swarm-team",
      name: "Rapid Swarm Team",
      description:
        "スピード重視の並列ワーカーチーム。独立したタスクを積極的に並列展開できる場合に使用する。Swarm Workerがそれぞれ異なる視点で迅速にタスクを遂行し、Swarm Synthesizerが出力を統合して一つの実行計画を作成する。",
      enabled: "enabled",
      members: [
        ...createRapidSwarmMembers(2),
        {
          id: "swarm-synthesizer",
          role: "Swarm Synthesizer",
          description: "並列ワーカーの出力を統合し、重複を除去して一つの実行計画を作成する。異なる視点からの意見を総合して、矛盾のないアクションプランを導き出す。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "refactor-migration-team",
      name: "Refactor & Migration Team",
      description:
        "リファクタリングに特化したチーム。影響分析、移行計画、実装戦略、互換性チェックを実施する。Impact Analystが影響範囲の特定、Migration Plannerが移行計画、Refactor Implementerが実装設計を担当し、三人で協調して安全なリファクタリングを行う。",
      enabled: "enabled",
      members: [
        {
          id: "impact-analyst",
          role: "Impact Analyst",
          description: "影響を受けるモジュール、依存関係、リスク集中領域をマッピングする。変更の影響範囲を特定し、リスクが高い部分を特定する。",
          enabled: true,
        },
        {
          id: "migration-planner",
          role: "Migration Planner",
          description: "段階的なロールアウトを設計し、チェックポイント、フォールバックポイント、ロールアウト順序を定義する。安全かつ順序よく移行を進めるための計画を作成する。",
          enabled: true,
        },
        {
          id: "refactor-implementer",
          role: "Refactor Implementer",
          description: "振る舞いを保持しつつ、最小限で安全なコード変更を提案する。既存の機能に影響を与えず、保守性を向上させる変更を行う。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: "code-excellence-review-team",
      name: "Code Excellence Review Team",
      description:
        "包括的なコードレビューチーム。可読性、エレガンス、保守性、長期的な運用可能性を評価する。Readability Reviewerが読みやすさ、Architecture Reviewerがアーキテクチャ、Review Synthesizerが総合評価を担当し、三人で協調してコード品質を向上させる。",
      enabled: "enabled",
      members: [
        {
          id: "readability-reviewer",
          role: "Readability Reviewer",
          description: "命名の明確さ、フローの可読性、認知的負荷をチェックする。変数名・関数名が適切か、コードの流れが追いやすいか、理解しやすさを評価する。",
          enabled: true,
        },
        {
          id: "architecture-reviewer",
          role: "Architecture Reviewer",
          description: "境界、レイヤリング、結合度、モジュール責任をレビューする。コンポーネント間の境界が適切か、層の分離ができているか、結合が疎になっているかを確認する。",
          enabled: true,
        },
        {
          id: "review-synthesizer",
          role: "Review Synthesizer",
          description: "レビュー結果を統合し、critical/should/niceの優先度に分類して具体的な修正案を提示する。最も重要な問題から順に対処するためのアクションリストを作成する。",
          enabled: true,
        },
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

/**
 * デフォルトチーム定義を生成
 * @summary デフォルトチーム作成
 * @param nowIso 現在日時のISO形式文字列
 * @param cwd カレントワーキングディレクトリ（任意）
 * @returns チーム定義の配列
 */
export function createDefaultTeams(nowIso: string, cwd?: string): TeamDefinition[] {
  const effectiveCwd = cwd || process.cwd();
  const markdownTeams = loadTeamDefinitionsFromMarkdown(effectiveCwd, nowIso);

  // If Markdown teams are loaded, return them
  if (markdownTeams.length > 0) {
    return markdownTeams;
  }

  // Fallback to hardcoded defaults
  console.log("[agent-teams] Using hardcoded default teams");
  return getHardcodedDefaultTeams(nowIso);
}

// ============================================================================
// Team Merging
// ============================================================================

const LEGACY_DEFAULT_MEMBER_IDS_BY_TEAM: Record<string, Set<string>> = {
  "core-delivery-team": new Set(["architecture", "test", "risk"]),
  "bug-war-room": new Set(["hypothesis-b", "hypothesis-c"]),
  "security-hardening-team": new Set(["dependency-auditor", "input-validator"]),
  "docs-enablement-team": new Set(["examples-owner", "changes-owner"]),
  "rapid-swarm-team": new Set([
    "swarm-03",
    "swarm-04",
    "swarm-05",
    "swarm-06",
    "swarm-07",
    "swarm-08",
/**
   * 既存のチーム定義とデフォルト定義をマージする
   *
   * 既存のチーム定義のメンバー設定（provider, model）を保持しつつ、
   * デフォルト定義のメンバーと統合して新しいチーム定義を返す。
   *
   * @param existing - 既存のチーム定義（ユーザー設定など）
   * @param fallback - デフォルトのチーム定義（フォールバック用）
   * @returns マージされたチーム定義
   * @example
   * const merged = mergeDefaultTeam(userTeam, defaultTeam);
   * // userTeamの設定を保持しつつ、defaultTeamのメンバーを統合
   */
  ]),
  "refactor-migration-team": new Set(["compatibility-tester", "rollback-planner"]),
  "code-excellence-review-team": new Set([
    "simplicity-reviewer",
    "maintainability-reviewer",
    "testability-reviewer",
    "performance-reviewer",
    "security-reviewer",
    "consistency-reviewer",
  ]),
};

/**
 * デフォルトチーム定義を統合
 *
 * 既存のチーム定義に、フォールバック用のデフォルト定義をマージします。
 * @summary デフォルトチーム定義を統合
 * @param existing - 既存のチーム定義
 * @param fallback - フォールバック用のデフォルトチーム定義
 * @returns マージ後のチーム定義
 */
export function mergeDefaultTeam(existing: TeamDefinition, fallback: TeamDefinition): TeamDefinition {
  const existingMembers = new Map(existing.members.map((member) => [member.id, member]));
  const fallbackMemberIds = new Set(fallback.members.map((member) => member.id));
  const legacyDefaultIds = LEGACY_DEFAULT_MEMBER_IDS_BY_TEAM[fallback.id] ?? new Set<string>();
  const mergedMembers = fallback.members.map((member) => {
    const existingMember = existingMembers.get(member.id);
    if (!existingMember) return member;
    return {
      ...member,
      provider: existingMember.provider,
      model: existingMember.model,
      enabled: existingMember.enabled,
    };
  });
  const preservedExtraMembers = existing.members.filter((member) => {
    if (fallbackMemberIds.has(member.id)) return false;
    if (legacyDefaultIds.has(member.id)) return false;
    return true;
  });
  const mergedMembersWithExtras = [...mergedMembers, ...preservedExtraMembers];

  const hasDrift =
    existing.name !== fallback.name ||
    existing.description !== fallback.description ||
    mergedMembersWithExtras.length !== existing.members.length ||
    mergedMembersWithExtras.some((member, index) => {
      const oldMember = existing.members[index];
      if (!oldMember) return true;
      return member.id !== oldMember.id || member.role !== oldMember.role || member.description !== oldMember.description;
    });

  return {
    ...fallback,
    enabled: existing.enabled,
    members: mergedMembersWithExtras,
    createdAt: existing.createdAt || fallback.createdAt,
    updatedAt: hasDrift ? new Date().toISOString() : existing.updatedAt || fallback.updatedAt,
  };
}

/**
 * デフォルト設定を適用
 *
 * ストレージに対して、現在時刻やディレクトリ情報を含むデフォルト設定を反映・統合します。
 * @summary デフォルト設定を適用
 * @param storage - 対象のストレージオブジェクト
 * @param nowIso - 現在時刻のISO 8601形式文字列
 * @param cwd - カレントワーキングディレクトリ（任意）
 * @returns デフォルト設定が適用されたストレージ
 */
export function ensureDefaults(
  storage: TeamStorage,
  nowIso: string,
  cwd?: string,
): TeamStorage {
  const effectiveCwd = cwd || process.cwd();
  const defaults = createDefaultTeams(nowIso, effectiveCwd);
  const defaultIds = new Set(defaults.map((team) => team.id));
  const deprecatedDefaultIds = new Set(["investigation-team"]);
  const existingById = new Map(storage.teams.map((team) => [team.id, team]));
  const mergedTeams: TeamDefinition[] = [];

  // Keep built-in definitions synchronized so size/role fixes are applied.
  for (const defaultTeam of defaults) {
    const existing = existingById.get(defaultTeam.id);
    if (!existing) {
      mergedTeams.push(defaultTeam);
      continue;
    }
    mergedTeams.push(mergeDefaultTeam(existing, defaultTeam));
  }

  // Preserve user-defined teams and drop deprecated built-ins.
  for (const team of storage.teams) {
    if (defaultIds.has(team.id)) continue;
    if (deprecatedDefaultIds.has(team.id)) continue;
    mergedTeams.push(team);
  }

  storage.teams = mergedTeams;
  storage.defaultsVersion = TEAM_DEFAULTS_VERSION;

  if (!storage.currentTeamId || !storage.teams.some((team) => team.id === storage.currentTeamId)) {
    storage.currentTeamId = defaults[0]?.id;
  }

  return storage;
}
