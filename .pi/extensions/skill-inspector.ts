/**
 * @abdd.meta
 * path: .pi/extensions/skill-inspector.ts
 * role: プロジェクト内のスキル定義とチームへの割り当て状況を集計・分析するツール
 * why: スキルがどこで定義され、どのチーム・メンバーに利用されているかを可視化するため
 * related: .pi/lib/skills/, .pi/agent-teams/definitions/, @mariozechner/pi-coding-agent
 * public_api: loadAvailableSkills, loadTeamDefinitions
 * invariants: SKILL.mdの必須項目不足時はディレクトリ名をnameとして使用する, ファイル読み込みエラー時は該当エントリをスキップする
 * side_effects: ファイルシステムからの読み取りのみ行い、書き込みは行わない
 * failure_modes: 指定ディレクトリが存在しない場合は空のMapまたは配列を返す, ファイルのパースに失敗した場合は例外を捕捉して処理を継続する
 * @abdd.explain
 * overview: `.pi/lib/skills/` ディレクトリから利用可能なスキルをロードし、`.pi/agent-teams/definitions/` からチーム定義をロードして、スキルの利用状況をマッピングする。
 * what_it_does:
 *   - SKILL.mdファイルのパースとスキル情報のMap作成
 *   - チーム定義ファイル（.md/.json）の走査とチーム・メンバーごとのスキル保持状況の特定
 * why_it_exists:
 *   - 複数のエージェントやチーム間でスキルの重複や未使用状況を把握する
 *   - プロジェクト全体のスキルアーキテクチャを理解しやすくする
 * scope:
 *   in: .pi/lib/skills/ ディレクトリ構造, .pi/agent-teams/definitions/ ファイル内容
 *   out: スキル定義のMap, スキル利用状況を含むチーム定義配列
 */

/**
 * Skill Inspector Extension
 * スキルの割り当て状況を表示するツール
 */

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { parseFrontmatter } from "../lib/frontmatter.js";

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Data Loading
// ============================================================================

const CWD = process.cwd();

/**
 * Load all available skills from .pi/lib/skills/
 */
function loadAvailableSkills(): Map<string, SkillInfo> {
  const skillsDir = join(CWD, ".pi", "lib", "skills");
  const skills = new Map<string, SkillInfo>();
  
  if (!existsSync(skillsDir)) {
    return skills;
  }
  
  const entries = readdirSync(skillsDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    
    const skillDir = join(skillsDir, entry.name);
    const skillFile = join(skillDir, "SKILL.md");
    
    if (!existsSync(skillFile)) continue;
    
    try {
      const content = readFileSync(skillFile, "utf-8");
      const { frontmatter } = parseFrontmatter<{ name?: string; description?: string }>(content);
      
      const name = frontmatter.name || entry.name;
      const description = frontmatter.description || "";
      
      skills.set(name, {
        name,
        description,
        filePath: skillFile,
      });
    } catch {
      // Skip on error
    }
  }
  
  return skills;
}

interface TeamFrontmatter {
  id?: string;
  name?: string;
  description?: string;
  enabled?: string;
  skills?: string[];
  members?: Array<{
    id?: string;
    role?: string;
    enabled?: boolean;
    skills?: string[];
  }>;
}

/**
 * Load team definitions with skill assignments
 */
function loadTeamDefinitions(): TeamWithSkills[] {
  const teamsDir = join(CWD, ".pi", "agent-teams", "definitions");
  const teams: TeamWithSkills[] = [];
  
  if (!existsSync(teamsDir)) {
    return teams;
  }
  
  const files = readdirSync(teamsDir).filter(f => 
    f.endsWith(".md") || f.endsWith(".json")
  );
  
  // Track loaded team IDs to prefer .md over .json
  const loadedTeams = new Map<string, TeamWithSkills>();
  
  for (const file of files) {
    const filePath = join(teamsDir, file);
    const content = readFileSync(filePath, "utf-8");
    
    let frontmatter: TeamFrontmatter;
    
    if (file.endsWith(".json")) {
      try {
        frontmatter = JSON.parse(content);
      } catch {
        continue;
      }
    } else {
      const parsed = parseFrontmatter<Record<string, unknown> & TeamFrontmatter>(content);
      frontmatter = parsed.frontmatter;
    }
    
    const teamId = frontmatter.id || basename(file, ".md").replace(".json", "");
    const teamName = frontmatter.name || teamId;
    const teamSkills = frontmatter.skills || [];
    
    const members: TeamMemberWithSkills[] = [];
    
    if (Array.isArray(frontmatter.members)) {
      for (const member of frontmatter.members) {
        members.push({
          id: member.id || "unknown",
          role: member.role || "Unknown",
          enabled: member.enabled !== false,
          skills: member.skills || [],
        });
      }
    }
    
    // Prefer .md files over .json files for the same team ID
    const existing = loadedTeams.get(teamId);
    const isMd = file.endsWith(".md");
    
    if (!existing || (isMd && !existing.hasSkills)) {
      loadedTeams.set(teamId, {
        id: teamId,
        name: teamName,
        description: frontmatter.description || "",
        enabled: frontmatter.enabled || "enabled",
        skills: teamSkills,
        members,
        hasSkills: teamSkills.length > 0 || members.some(m => m.skills.length > 0),
      });
    }
  }
  
  return [...loadedTeams.values()];
}

/**
 * Calculate skill usage across all teams
 */
function calculateSkillUsage(
  skills: Map<string, SkillInfo>,
  teams: TeamWithSkills[]
): Map<string, SkillUsage> {
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
            m => m.teamId === team.id && m.memberId === member.id
          );
          if (!exists) {
            skill.usedByMembers.push({ teamId: team.id, memberId: member.id });
          }
        }
      }
    }
  }
  
  return usage;
}

// ============================================================================
// Output Formatters
// ============================================================================

/**
 * Format skills overview - Plain text version for command output
 */
function formatSkillsOverviewPlain(
  skills: Map<string, SkillInfo>,
  usage: Map<string, SkillUsage>
): string {
  const lines: string[] = [];
  
  lines.push("SKILLS ASSIGNMENT OVERVIEW");
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Total Skills: ${skills.size}`);
  lines.push(`Assigned to Teams: ${[...usage.values()].filter(s => s.usedByTeams.length > 0).length}`);
  lines.push(`Assigned to Members: ${[...usage.values()].filter(s => s.usedByMembers.length > 0).length}`);
  lines.push("");
  
  lines.push("ALL SKILLS");
  lines.push("-".repeat(70));
  lines.push("");
  
  for (const [name, skill] of [...skills.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const skillUsage = usage.get(name)!;
    const hasTeam = skillUsage.usedByTeams.length > 0;
    const hasMember = skillUsage.usedByMembers.length > 0;
    
    let status = "[UNASSIGNED]";
    if (hasTeam && hasMember) status = "[TEAM + MEMBER]";
    else if (hasTeam) status = "[TEAM ONLY]";
    else if (hasMember) status = "[MEMBER ONLY]";
    
    lines.push(`[${name}]`);
    lines.push(`  Status: ${status}`);
    
    // Truncate description
    const shortDesc = skill.description.replace(/\n/g, " ").slice(0, 80);
    lines.push(`  Desc: ${shortDesc}${skill.description.length > 80 ? "..." : ""}`);
    
    if (hasMember) {
      const memberList = skillUsage.usedByMembers.map(m => m.memberId).join(", ");
      lines.push(`  Members: ${memberList}`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format team detail - Plain text version for command output
 */
function formatTeamDetailPlain(team: TeamWithSkills): string {
  const lines: string[] = [];
  
  lines.push(`TEAM: ${team.name}`);
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`ID: ${team.id}`);
  lines.push(`Status: ${team.enabled === "enabled" ? "ACTIVE" : "INACTIVE"}`);
  lines.push(`Team Common Skills: ${team.skills.length > 0 ? team.skills.join(", ") : "(none)"}`);
  lines.push("");
  
  lines.push("MEMBER SKILLS");
  lines.push("-".repeat(70));
  lines.push("");
  
  for (const member of team.members) {
    const status = member.enabled ? "" : " [DISABLED]";
    lines.push(`${member.id}${status}`);
    
    // Team common skills first
    for (const skill of team.skills.sort()) {
      const isAlsoMember = member.skills.includes(skill);
      lines.push(`  [T${isAlsoMember ? "+M" : ""}] ${skill}`);
    }
    
    // Member-only skills
    for (const skill of member.skills.filter(s => !team.skills.includes(s)).sort()) {
      lines.push(`  [M] ${skill}`);
    }
    
    if (team.skills.length === 0 && member.skills.length === 0) {
      lines.push("  (no skills)");
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format skill detail - Plain text version for command output
 */
function formatSkillDetailPlain(skill: SkillInfo, usage: SkillUsage): string {
  const lines: string[] = [];
  
  lines.push(`SKILL: ${skill.name}`);
  lines.push("=".repeat(70));
  lines.push("");
  lines.push(`Location: ${skill.filePath}`);
  lines.push("");
  
  lines.push("Description:");
  lines.push(`  ${skill.description.replace(/\n/g, "\n  ")}`);
  lines.push("");
  
  lines.push("Assignments:");
  if (usage.usedByTeams.length > 0) {
    lines.push(`  Team Common: ${usage.usedByTeams.join(", ")}`);
  }
  if (usage.usedByMembers.length > 0) {
    lines.push(`  Members (${usage.usedByMembers.length}):`);
    for (const m of usage.usedByMembers) {
      lines.push(`    - ${m.teamId}/${m.memberId}`);
    }
  }
  if (usage.usedByTeams.length === 0 && usage.usedByMembers.length === 0) {
    lines.push("  (unassigned)");
  }
  lines.push("");
  
  return lines.join("\n");
}

/**
 * Format teams view - Plain text version for command output
 */
function formatTeamsViewPlain(teams: TeamWithSkills[]): string {
  const lines: string[] = [];
  
  lines.push("TEAMS SKILLS OVERVIEW");
  lines.push("=".repeat(70));
  lines.push("");
  
  const teamsWithSkills = teams.filter(t => t.skills.length > 0 || t.members.some(m => m.skills.length > 0));
  const teamsWithoutSkills = teams.filter(t => t.skills.length === 0 && !t.members.some(m => m.skills.length > 0));
  
  lines.push(`Teams with skills: ${teamsWithSkills.length}`);
  lines.push(`Teams without skills: ${teamsWithoutSkills.length}`);
  lines.push("");
  
  if (teamsWithSkills.length > 0) {
    lines.push("TEAMS WITH SKILL ASSIGNMENTS");
    lines.push("-".repeat(70));
    lines.push("");
    
    for (const team of teamsWithSkills.sort((a, b) => a.name.localeCompare(b.name))) {
      const status = team.enabled === "enabled" ? "ACTIVE" : "INACTIVE";
      lines.push(`${team.name} [${status}]`);
      lines.push(`  ID: ${team.id}`);
      
      if (team.skills.length > 0) {
        lines.push(`  Team Common: ${team.skills.join(", ")}`);
      }
      
      const membersWithSkills = team.members.filter(m => m.skills.length > 0);
      if (membersWithSkills.length > 0) {
        lines.push(`  Members with skills (${membersWithSkills.length}):`);
        for (const m of membersWithSkills) {
          const dis = m.enabled ? "" : " [disabled]";
          lines.push(`    ${m.id}${dis}: ${m.skills.join(", ")}`);
        }
      }
      lines.push("");
    }
  }
  
  if (teamsWithoutSkills.length > 0) {
    lines.push("TEAMS WITHOUT SKILLS");
    lines.push("-".repeat(70));
    lines.push("");
    for (const team of teamsWithoutSkills.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`  ${team.name} (${team.members.length} members)`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format skills overview (markdown for tool output)
 */
function formatSkillsOverview(
  skills: Map<string, SkillInfo>,
  usage: Map<string, SkillUsage>
): string {
  const lines: string[] = [];
  
  // Header
  lines.push("╔══════════════════════════════════════════════════════════════════╗");
  lines.push("║                     SKILLS ASSIGNMENT OVERVIEW                    ║");
  lines.push("╚══════════════════════════════════════════════════════════════════╝");
  lines.push("");
  
  // Summary stats
  lines.push("## Summary Statistics");
  lines.push("");
  lines.push(`  Total Skills: ${skills.size}`);
  lines.push(`  Assigned to Teams: ${[...usage.values()].filter(s => s.usedByTeams.length > 0).length}`);
  lines.push(`  Assigned to Members: ${[...usage.values()].filter(s => s.usedByMembers.length > 0).length}`);
  lines.push("");
  
  // All skills with details
  lines.push("## All Available Skills");
  lines.push("");
  
  const sortedSkills = [...skills.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  
  for (const [name, skill] of sortedSkills) {
    const skillUsage = usage.get(name)!;
    const hasTeam = skillUsage.usedByTeams.length > 0;
    const hasMember = skillUsage.usedByMembers.length > 0;
    
    let assignmentStatus = "UNASSIGNED";
    if (hasTeam && hasMember) assignmentStatus = "TEAM + MEMBER";
    else if (hasTeam) assignmentStatus = "TEAM ONLY";
    else if (hasMember) assignmentStatus = "MEMBER ONLY";
    
    lines.push(`### ${name}`);
    lines.push("");
    lines.push(`  Status: [${assignmentStatus}]`);
    lines.push("");
    lines.push(`  Description:`);
    lines.push(`    ${skill.description.slice(0, 100)}${skill.description.length > 100 ? "..." : ""}`);
    lines.push("");
    
    if (hasTeam) {
      lines.push(`  Team Common:`);
      for (const team of skillUsage.usedByTeams) {
        lines.push(`    - ${team}`);
      }
      lines.push("");
    }
    
    if (hasMember) {
      lines.push(`  Member Assignments (${skillUsage.usedByMembers.length} members):`);
      const membersByTeam = new Map<string, string[]>();
      for (const m of skillUsage.usedByMembers) {
        if (!membersByTeam.has(m.teamId)) {
          membersByTeam.set(m.teamId, []);
        }
        membersByTeam.get(m.teamId)!.push(m.memberId);
      }
      for (const [teamId, members] of membersByTeam) {
        lines.push(`    - ${teamId}: ${members.join(", ")}`);
      }
      lines.push("");
    }
    
    lines.push("  " + "─".repeat(66));
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format team skills view
 */
function formatTeamsView(teams: TeamWithSkills[]): string {
  const lines: string[] = [];
  
  lines.push("╔══════════════════════════════════════════════════════════════════╗");
  lines.push("║                   TEAMS SKILLS ASSIGNMENT                         ║");
  lines.push("╚══════════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`Total Teams: ${teams.length}`);
  lines.push(`Teams with Skills: ${teams.filter(t => t.skills.length > 0 || t.members.some(m => m.skills.length > 0)).length}`);
  lines.push("");
  
  // Teams WITH skills first
  const teamsWithSkills = teams.filter(t => t.skills.length > 0 || t.members.some(m => m.skills.length > 0));
  const teamsWithoutSkills = teams.filter(t => t.skills.length === 0 && !t.members.some(m => m.skills.length > 0));
  
  if (teamsWithSkills.length > 0) {
    lines.push("## Teams WITH Skill Assignments");
    lines.push("");
    
    for (const team of teamsWithSkills.sort((a, b) => a.name.localeCompare(b.name))) {
      const statusIcon = team.enabled === "enabled" ? "[ACTIVE]" : "[INACTIVE]";
      
      lines.push(`### ${team.name} ${statusIcon}`);
      lines.push("");
      lines.push(`  ID: ${team.id}`);
      lines.push("");
      
      if (team.skills.length > 0) {
        lines.push(`  Team Common Skills (${team.skills.length}):`);
        for (const skill of team.skills.sort()) {
          lines.push(`    - ${skill}`);
        }
        lines.push("");
      }
      
      const membersWithSkills = team.members.filter(m => m.skills.length > 0);
      if (membersWithSkills.length > 0) {
        lines.push(`  Members with Skills (${membersWithSkills.length}/${team.members.length}):`);
        lines.push("");
        for (const member of membersWithSkills) {
          const enabledTag = member.enabled ? "" : " [disabled]";
          lines.push(`    ${member.id}${enabledTag}:`);
          for (const skill of member.skills.sort()) {
            lines.push(`      - ${skill}`);
          }
          lines.push("");
        }
      }
      
      lines.push("  " + "─".repeat(66));
      lines.push("");
    }
  }
  
  if (teamsWithoutSkills.length > 0) {
    lines.push("## Teams WITHOUT Skill Assignments");
    lines.push("");
    
    for (const team of teamsWithoutSkills.sort((a, b) => a.name.localeCompare(b.name))) {
      const statusIcon = team.enabled === "enabled" ? "[ACTIVE]" : "[INACTIVE]";
      lines.push(`  ${team.name} ${statusIcon} (${team.members.length} members)`);
    }
    lines.push("");
  }
  
  return lines.join("\n");
}

/**
 * Format single team detail
 */
function formatTeamDetail(team: TeamWithSkills): string {
  const lines: string[] = [];
  
  lines.push("╔══════════════════════════════════════════════════════════════════╗");
  lines.push(`║  ${team.name.toUpperCase().padEnd(64)}║`);
  lines.push("╚══════════════════════════════════════════════════════════════════╝");
  lines.push("");
  
  lines.push("## Team Information");
  lines.push("");
  lines.push(`  ID: ${team.id}`);
  lines.push(`  Status: ${team.enabled === "enabled" ? "[ACTIVE]" : "[INACTIVE]"}`);
  lines.push("");
  
  if (team.description) {
    lines.push(`  Description:`);
    lines.push(`    ${team.description.slice(0, 200)}${team.description.length > 200 ? "..." : ""}`);
    lines.push("");
  }
  
  // Team common skills
  lines.push("## Team Common Skills");
  lines.push("");
  if (team.skills.length > 0) {
    for (const skill of team.skills.sort()) {
      lines.push(`  - ${skill}`);
    }
  } else {
    lines.push("  (none)");
  }
  lines.push("");
  
  // Member skills matrix
  lines.push("## Member Skills Matrix");
  lines.push("");
  
  // Collect all unique skills
  const allSkills = new Set<string>();
  for (const member of team.members) {
    for (const skill of member.skills) {
      allSkills.add(skill);
    }
  }
  for (const skill of team.skills) {
    allSkills.add(skill);
  }
  
  const sortedSkills = [...allSkills].sort();
  
  if (sortedSkills.length === 0) {
    lines.push("  (no skills assigned to any member)");
  } else {
    lines.push("  Legend: T = Team common, M = Member specific, T+M = Both");
    lines.push("");
    
    for (const member of team.members) {
      const enabledTag = member.enabled ? "" : " [DISABLED]";
      lines.push(`  ${member.id}${enabledTag} (${member.role})`);
      
      if (member.skills.length > 0 || team.skills.length > 0) {
        const effectiveSkills = new Set([
          ...team.skills,
          ...member.skills,
        ]);
        
        for (const skill of [...effectiveSkills].sort()) {
          const isTeam = team.skills.includes(skill);
          const isMember = member.skills.includes(skill);
          let source = "";
          if (isTeam && isMember) source = "[T+M]";
          else if (isTeam) source = "[T]";
          else source = "[M]";
          
          lines.push(`    ${source} ${skill}`);
        }
      } else {
        lines.push("    (no skills)");
      }
      lines.push("");
    }
  }
  
  // Summary
  lines.push("## Assignment Summary");
  lines.push("");
  lines.push(`  Total Members: ${team.members.length}`);
  lines.push(`  Active Members: ${team.members.filter(m => m.enabled).length}`);
  lines.push(`  Team Common Skills: ${team.skills.length}`);
  lines.push(`  Unique Member Skills: ${[...allSkills].filter(s => !team.skills.includes(s)).length}`);
  lines.push(`  Total Unique Skills: ${allSkills.size}`);
  lines.push("");
  
  return lines.join("\n");
}

/**
 * Format skill detail
 */
function formatSkillDetail(
  skill: SkillInfo,
  usage: SkillUsage
): string {
  const lines: string[] = [];
  
  lines.push("╔══════════════════════════════════════════════════════════════════╗");
  lines.push(`║  SKILL: ${skill.name.toUpperCase().padEnd(56)}║`);
  lines.push("╚══════════════════════════════════════════════════════════════════╝");
  lines.push("");
  
  lines.push("## Basic Information");
  lines.push("");
  lines.push(`  Name: ${skill.name}`);
  lines.push(`  Location: ${skill.filePath}`);
  lines.push("");
  
  lines.push("## Description");
  lines.push("");
  const descLines = skill.description.split("\n");
  for (const line of descLines) {
    lines.push(`  ${line}`);
  }
  lines.push("");
  
  lines.push("## Assignment Status");
  lines.push("");
  
  if (usage.usedByTeams.length > 0) {
    lines.push(`  Assigned as Team Common (${usage.usedByTeams.length} teams):`);
    for (const team of usage.usedByTeams) {
      lines.push(`    - ${team}`);
    }
    lines.push("");
  }
  
  if (usage.usedByMembers.length > 0) {
    lines.push(`  Assigned to Members (${usage.usedByMembers.length} members):`);
    lines.push("");
    
    const membersByTeam = new Map<string, string[]>();
    for (const m of usage.usedByMembers) {
      if (!membersByTeam.has(m.teamId)) {
        membersByTeam.set(m.teamId, []);
      }
      membersByTeam.get(m.teamId)!.push(m.memberId);
    }
    
    for (const [teamId, members] of membersByTeam) {
      lines.push(`    ${teamId}:`);
      for (const member of members.sort()) {
        lines.push(`      - ${member}`);
      }
      lines.push("");
    }
  }
  
  if (usage.usedByTeams.length === 0 && usage.usedByMembers.length === 0) {
    lines.push("  [UNASSIGNED] This skill is not assigned to any team or member.");
    lines.push("");
  }
  
  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`  Team Assignments: ${usage.usedByTeams.length}`);
  lines.push(`  Member Assignments: ${usage.usedByMembers.length}`);
  lines.push("");
  
  return lines.join("\n");
}

// ============================================================================
// Tool Registration
// ============================================================================

export default function (pi: ExtensionAPI) {
  // Register skill_status tool
  pi.registerTool({
    name: "skill_status",
    description: "Show skill assignment status. Use to see which skills are available, which teams use which skills, and which members have skill assignments.",
    parameters: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["overview", "teams", "team", "skill"],
          description: "View type: overview (all skills), teams (all teams), team (single team), skill (single skill detail)"
        },
        teamId: {
          type: "string",
          description: "Team ID for team view"
        },
        skillName: {
          type: "string",
          description: "Skill name for skill view"
        }
      },
      required: ["view"]
    },
    execute: async (_toolCallId: string, params: { view: string; teamId?: string; skillName?: string }, _signal: unknown, _onUpdate: unknown, ctx: { ui?: { notify: (msg: string, type: string) => void } }) => {
      const skills = loadAvailableSkills();
      const teams = loadTeamDefinitions();
      const usage = calculateSkillUsage(skills, teams);
      
      let output: string;
      
      switch (params.view) {
        case "overview":
          output = formatSkillsOverview(skills, usage);
          break;
        case "teams":
          output = formatTeamsView(teams);
          break;
        case "team":
          if (!params.teamId) {
            const teamList = teams.map(t => `- ${t.id}: ${t.name}`).join("\n");
            output = `teamId required. Available teams:\n${teamList}`;
          } else {
            const team = teams.find(t => t.id === params.teamId);
            output = team ? formatTeamDetail(team) : `Team not found: ${params.teamId}`;
          }
          break;
        case "skill":
          if (!params.skillName) {
            const skillList = [...skills.keys()].sort().join("\n- ");
            output = `skillName required. Available skills:\n- ${skillList}`;
          } else {
            const skill = skills.get(params.skillName);
            output = skill ? formatSkillDetail(skill, usage.get(params.skillName)!) : `Skill not found: ${params.skillName}`;
          }
          break;
        default:
          output = `Unknown view: ${params.view}`;
      }
      
      return {
        content: [{ type: "text" as const, text: output }],
      };
    }
  } as any);

  // Register /skill-status command
  pi.registerCommand("skill-status", {
    description: "Show skill assignment status",
    handler: async (args: string, ctx) => {
      const parts = args.trim().split(/\s+/);
      const view = parts[0] || "overview";
      const teamId = parts[1];
      const skillName = parts[1];
      
      const skills = loadAvailableSkills();
      const teams = loadTeamDefinitions();
      const usage = calculateSkillUsage(skills, teams);
      
      let output: string;
      
      switch (view) {
        case "teams":
          output = formatTeamsViewPlain(teams);
          break;
        case "team":
          if (!teamId) {
            output = "Usage: /skill-status team <teamId>\n\nAvailable teams:\n" + 
              teams.map(t => `  ${t.id}`).join("\n");
          } else {
            const team = teams.find(t => t.id === teamId);
            output = team ? formatTeamDetailPlain(team) : `Team not found: ${teamId}`;
          }
          break;
        case "skill":
          if (!skillName) {
            output = "Usage: /skill-status skill <skillName>\n\nAvailable skills:\n" + 
              [...skills.keys()].sort().map(s => `  ${s}`).join("\n");
          } else {
            const skill = skills.get(skillName);
            output = skill ? formatSkillDetailPlain(skill, usage.get(skillName)!) : `Skill not found: ${skillName}`;
          }
          break;
        default:
          output = formatSkillsOverviewPlain(skills, usage);
      }
      
      ctx.ui.notify(output, "info");
    }
  });

  // Notify on session start
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Skill Inspector loaded. Use /skill-status or skill_status tool.", "info");
  });
}
