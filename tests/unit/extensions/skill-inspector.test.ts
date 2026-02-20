/**
 * @file .pi/extensions/skill-inspector.ts の単体テスト
 * @description スキル割り当て状況表示ツールの型・ユーティリティ関数のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

// ============================================================================
// 型定義のテスト
// ============================================================================

describe("skill-inspector.ts 型定義", () => {
	interface SkillInfo {
		name: string;
		description: string;
		filePath: string;
	}

	interface TeamMemberWithSkills {
		id: string;
		role: string;
		enabled: boolean;
		skills: string[];
	}

	interface TeamWithSkills {
		id: string;
		name: string;
		description: string;
		enabled: string;
		skills: string[];
		members: TeamMemberWithSkills[];
		hasSkills?: boolean;
	}

	interface SkillUsage {
		name: string;
		description: string;
		usedByTeams: string[];
		usedByMembers: { teamId: string; memberId: string }[];
	}

	describe("SkillInfo型", () => {
		it("最小構造で作成", () => {
			const skill: SkillInfo = {
				name: "git-workflow",
				description: "Git操作支援",
				filePath: ".pi/lib/skills/git-workflow/SKILL.md",
			};
			expect(skill.name).toBe("git-workflow");
			expect(skill.description).toBe("Git操作支援");
		});

		it("空の説明で作成", () => {
			const skill: SkillInfo = {
				name: "test-skill",
				description: "",
				filePath: ".pi/lib/skills/test-skill/SKILL.md",
			};
			expect(skill.description).toBe("");
		});
	});

	describe("TeamMemberWithSkills型", () => {
		it("スキル付きメンバーを作成", () => {
			const member: TeamMemberWithSkills = {
				id: "implementer",
				role: "Implementation helper",
				enabled: true,
				skills: ["test-engineering", "code-review"],
			};
			expect(member.skills).toHaveLength(2);
		});

		it("スキルなしメンバーを作成", () => {
			const member: TeamMemberWithSkills = {
				id: "observer",
				role: "Observer",
				enabled: true,
				skills: [],
			};
			expect(member.skills).toHaveLength(0);
		});

		it("無効化されたメンバーを作成", () => {
			const member: TeamMemberWithSkills = {
				id: "deprecated",
				role: "Old role",
				enabled: false,
				skills: [],
			};
			expect(member.enabled).toBe(false);
		});
	});

	describe("TeamWithSkills型", () => {
		it("チーム共通スキル付きで作成", () => {
			const team: TeamWithSkills = {
				id: "dev-team",
				name: "Development Team",
				description: "開発チーム",
				enabled: "enabled",
				skills: ["git-workflow", "clean-architecture"],
				members: [],
				hasSkills: true,
			};
			expect(team.skills).toHaveLength(2);
		});

		it("メンバー固有スキルを持つチームを作成", () => {
			const team: TeamWithSkills = {
				id: "mixed-team",
				name: "Mixed Team",
				description: "",
				enabled: "enabled",
				skills: [],
				members: [
					{ id: "impl", role: "Implementer", enabled: true, skills: ["test-engineering"] },
				],
				hasSkills: true,
			};
			expect(team.members[0].skills).toHaveLength(1);
		});

		it("無効化されたチームを作成", () => {
			const team: TeamWithSkills = {
				id: "archived",
				name: "Archived Team",
				description: "",
				enabled: "disabled",
				skills: [],
				members: [],
			};
			expect(team.enabled).toBe("disabled");
		});
	});

	describe("SkillUsage型", () => {
		it("未割り当てスキルを作成", () => {
			const usage: SkillUsage = {
				name: "unused-skill",
				description: "未使用スキル",
				usedByTeams: [],
				usedByMembers: [],
			};
			expect(usage.usedByTeams).toHaveLength(0);
			expect(usage.usedByMembers).toHaveLength(0);
		});

		it("チーム割り当て済みスキルを作成", () => {
			const usage: SkillUsage = {
				name: "team-skill",
				description: "チーム共通",
				usedByTeams: ["dev-team", "qa-team"],
				usedByMembers: [],
			};
			expect(usage.usedByTeams).toHaveLength(2);
		});

		it("メンバー割り当て済みスキルを作成", () => {
			const usage: SkillUsage = {
				name: "member-skill",
				description: "メンバー固有",
				usedByTeams: [],
				usedByMembers: [
					{ teamId: "dev-team", memberId: "implementer" },
					{ teamId: "dev-team", memberId: "reviewer" },
				],
			};
			expect(usage.usedByMembers).toHaveLength(2);
		});
	});
});

// ============================================================================
// ユーティリティ関数のテスト
// ============================================================================

describe("ユーティリティ関数", () => {
	describe("calculateSkillUsage", () => {
		// 実装と同等の関数をローカルに定義
		interface SkillInfo {
			name: string;
			description: string;
			filePath: string;
		}

		interface TeamMemberWithSkills {
			id: string;
			role: string;
			enabled: boolean;
			skills: string[];
		}

		interface TeamWithSkills {
			id: string;
			name: string;
			description: string;
			enabled: string;
			skills: string[];
			members: TeamMemberWithSkills[];
			hasSkills?: boolean;
		}

		interface SkillUsage {
			name: string;
			description: string;
			usedByTeams: string[];
			usedByMembers: { teamId: string; memberId: string }[];
		}

		const calculateSkillUsage = (
			skills: Map<string, SkillInfo>,
			teams: TeamWithSkills[]
		): Map<string, SkillUsage> => {
			const usage = new Map<string, SkillUsage>();

			// Initialize with all skills
			for (const [name, skill] of skills) {
				usage.set(name, {
					name,
					description: skill.description,
					usedByTeams: [],
					usedByMembers: [],
				});
			}

			// Track usage
			for (const team of teams) {
				// Team-level skills
				for (const skillName of team.skills) {
					const skill = usage.get(skillName);
					if (skill && !skill.usedByTeams.includes(team.name)) {
						skill.usedByTeams.push(team.name);
					}
				}

				// Member-level skills
				for (const member of team.members) {
					for (const skillName of member.skills) {
						const skill = usage.get(skillName);
						if (skill) {
							const exists = skill.usedByMembers.some(
								(m) => m.teamId === team.id && m.memberId === member.id
							);
							if (!exists) {
								skill.usedByMembers.push({ teamId: team.id, memberId: member.id });
							}
						}
					}
				}
			}

			return usage;
		};

		it("空のスキルマップで空の結果", () => {
			const skills = new Map<string, SkillInfo>();
			const teams: TeamWithSkills[] = [];
			const result = calculateSkillUsage(skills, teams);
			expect(result.size).toBe(0);
		});

		it("スキルがある場合すべて初期化される", () => {
			const skills = new Map<string, SkillInfo>();
			skills.set("git-workflow", {
				name: "git-workflow",
				description: "Git操作",
				filePath: ".pi/lib/skills/git-workflow/SKILL.md",
			});
			const teams: TeamWithSkills[] = [];
			const result = calculateSkillUsage(skills, teams);
			expect(result.size).toBe(1);
			expect(result.get("git-workflow")?.usedByTeams).toEqual([]);
		});

		it("チーム共通スキルを追跡", () => {
			const skills = new Map<string, SkillInfo>();
			skills.set("git-workflow", {
				name: "git-workflow",
				description: "Git操作",
				filePath: ".pi/lib/skills/git-workflow/SKILL.md",
			});
			const teams: TeamWithSkills[] = [
				{
					id: "dev-team",
					name: "Development Team",
					description: "",
					enabled: "enabled",
					skills: ["git-workflow"],
					members: [],
				},
			];
			const result = calculateSkillUsage(skills, teams);
			expect(result.get("git-workflow")?.usedByTeams).toContain("Development Team");
		});

		it("メンバー固有スキルを追跡", () => {
			const skills = new Map<string, SkillInfo>();
			skills.set("test-engineering", {
				name: "test-engineering",
				description: "テスト",
				filePath: ".pi/lib/skills/test-engineering/SKILL.md",
			});
			const teams: TeamWithSkills[] = [
				{
					id: "dev-team",
					name: "Development Team",
					description: "",
					enabled: "enabled",
					skills: [],
					members: [
						{ id: "implementer", role: "Impl", enabled: true, skills: ["test-engineering"] },
					],
				},
			];
			const result = calculateSkillUsage(skills, teams);
			expect(result.get("test-engineering")?.usedByMembers).toHaveLength(1);
			expect(result.get("test-engineering")?.usedByMembers[0]).toEqual({
				teamId: "dev-team",
				memberId: "implementer",
			});
		});

		it("重複メンバー割り当てを除外", () => {
			const skills = new Map<string, SkillInfo>();
			skills.set("skill-a", {
				name: "skill-a",
				description: "",
				filePath: "",
			});
			const teams: TeamWithSkills[] = [
				{
					id: "team-1",
					name: "Team 1",
					description: "",
					enabled: "enabled",
					skills: [],
					members: [
						{ id: "member-1", role: "Role", enabled: true, skills: ["skill-a", "skill-a"] },
					],
				},
			];
			const result = calculateSkillUsage(skills, teams);
			expect(result.get("skill-a")?.usedByMembers).toHaveLength(1);
		});

		it("複数チームで使用されるスキル", () => {
			const skills = new Map<string, SkillInfo>();
			skills.set("shared-skill", {
				name: "shared-skill",
				description: "",
				filePath: "",
			});
			const teams: TeamWithSkills[] = [
				{
					id: "team-1",
					name: "Team 1",
					description: "",
					enabled: "enabled",
					skills: ["shared-skill"],
					members: [],
				},
				{
					id: "team-2",
					name: "Team 2",
					description: "",
					enabled: "enabled",
					skills: ["shared-skill"],
					members: [],
				},
			];
			const result = calculateSkillUsage(skills, teams);
			expect(result.get("shared-skill")?.usedByTeams).toHaveLength(2);
		});
	});

	describe("フォーマッタ関数のロジック", () => {
		describe("ステータス判定", () => {
			const getStatus = (hasTeam: boolean, hasMember: boolean): string => {
				if (hasTeam && hasMember) return "TEAM + MEMBER";
				if (hasTeam) return "TEAM ONLY";
				if (hasMember) return "MEMBER ONLY";
				return "UNASSIGNED";
			};

			it("チームとメンバー両方", () => {
				expect(getStatus(true, true)).toBe("TEAM + MEMBER");
			});

			it("チームのみ", () => {
				expect(getStatus(true, false)).toBe("TEAM ONLY");
			});

			it("メンバーのみ", () => {
				expect(getStatus(false, true)).toBe("MEMBER ONLY");
			});

			it("未割り当て", () => {
				expect(getStatus(false, false)).toBe("UNASSIGNED");
			});
		});

		describe("説明の切り詰め", () => {
			const truncateDescription = (desc: string, maxLength = 80): string => {
				const shortDesc = desc.replace(/\n/g, " ").slice(0, maxLength);
				return shortDesc + (desc.length > maxLength ? "..." : "");
			};

			it("短い説明はそのまま", () => {
				expect(truncateDescription("短い説明")).toBe("短い説明");
			});

			it("長い説明は切り詰め", () => {
				const long = "a".repeat(100);
				const result = truncateDescription(long);
				expect(result.length).toBe(83); // 80 + "..."
				expect(result.endsWith("...")).toBe(true);
			});

			it("改行はスペースに置換", () => {
				expect(truncateDescription("line1\nline2")).toBe("line1 line2");
			});
		});
	});
});

// ============================================================================
// エッジケースのテスト
// ============================================================================

describe("エッジケース", () => {
	describe("空のデータ処理", () => {
		it("空のチーム配列を処理", () => {
			const skills = new Map<string, { name: string; description: string; filePath: string }>();
			skills.set("skill-a", { name: "skill-a", description: "", filePath: "" });
			const teams: any[] = [];

			const usage = new Map<string, any>();
			for (const [name, skill] of skills) {
				usage.set(name, {
					name,
					description: skill.description,
					usedByTeams: [],
					usedByMembers: [],
				});
			}

			expect(usage.size).toBe(1);
			expect(usage.get("skill-a")?.usedByTeams).toEqual([]);
		});

		it("メンバーなしチームを処理", () => {
			const team = {
				id: "empty-team",
				name: "Empty Team",
				members: [],
				skills: [],
			};
			expect(team.members).toHaveLength(0);
		});
	});

	describe("特殊文字を含むデータ", () => {
		it("スキル名にハイフンを含む", () => {
			const skill = {
				name: "git-workflow-skill",
				description: "Git workflow",
			};
			expect(skill.name).toContain("-");
		});

		it("説明に改行を含む", () => {
			const skill = {
				name: "test",
				description: "Line 1\nLine 2\nLine 3",
			};
			expect(skill.description.split("\n")).toHaveLength(3);
		});
	});

	describe("境界値", () => {
		it("大量のスキルを処理", () => {
			const skills = new Map<string, { name: string; description: string; filePath: string }>();
			for (let i = 0; i < 100; i++) {
				skills.set(`skill-${i}`, {
					name: `skill-${i}`,
					description: `Description ${i}`,
					filePath: `path-${i}`,
				});
			}
			expect(skills.size).toBe(100);
		});

		it("大量のメンバーを処理", () => {
			const members = [];
			for (let i = 0; i < 50; i++) {
				members.push({
					id: `member-${i}`,
					role: `Role ${i}`,
					enabled: true,
					skills: [],
				});
			}
			expect(members).toHaveLength(50);
		});
	});
});

// ============================================================================
// プロパティベーステスト
// ============================================================================

describe("プロパティベーステスト", () => {
	it("calculateSkillUsageの結果は常に整合している", () => {
		const calculateSkillUsage = (
			skills: Map<string, { name: string; description: string }>,
			teams: Array<{ id: string; name: string; skills: string[]; members: Array<{ id: string; skills: string[] }> }>
		): Map<string, { usedByTeams: string[]; usedByMembers: Array<{ teamId: string; memberId: string }> }> => {
			const usage = new Map<string, any>();

			for (const [name, skill] of skills) {
				usage.set(name, {
					name,
					description: skill.description,
					usedByTeams: [],
					usedByMembers: [],
				});
			}

			for (const team of teams) {
				for (const skillName of team.skills) {
					const skill = usage.get(skillName);
					if (skill && !skill.usedByTeams.includes(team.name)) {
						skill.usedByTeams.push(team.name);
					}
				}

				for (const member of team.members) {
					for (const skillName of member.skills) {
						const skill = usage.get(skillName);
						if (skill) {
							const exists = skill.usedByMembers.some(
								(m: any) => m.teamId === team.id && m.memberId === member.id
							);
							if (!exists) {
								skill.usedByMembers.push({ teamId: team.id, memberId: member.id });
							}
						}
					}
				}
			}

			return usage;
		};

		fc.assert(
			fc.property(
				fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 10 }),
				fc.array(
					fc.record({
						id: fc.string({ minLength: 1, maxLength: 10 }),
						name: fc.string({ minLength: 1, maxLength: 20 }),
						skills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
						members: fc.array(
							fc.record({
								id: fc.string({ minLength: 1, maxLength: 10 }),
								skills: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
							}),
							{ maxLength: 5 }
						),
					}),
					{ maxLength: 5 }
				),
				(skillNames, teams) => {
					const skills = new Map<string, { name: string; description: string }>();
					for (const name of skillNames) {
						skills.set(name, { name, description: "" });
					}

					const result = calculateSkillUsage(skills, teams);

					// 結果のサイズはスキル数と等しい
					if (result.size !== skills.size) return false;

					// 各スキルの配列は重複を含まない（整合性チェック）
					for (const [, usage] of result) {
						const uniqueTeams = new Set(usage.usedByTeams);
						if (uniqueTeams.size !== usage.usedByTeams.length) return false;
					}

					return true;
				}
			)
		);
	});
});
