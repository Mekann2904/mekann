/**
 * Startup Context Extension
 *
 * Injects dynamic context information on the first prompt of each session:
 * - Last 10 git commit messages (title only)
 * - README.md content (full content)
 * - Current working directory path
 *
 * Each section includes usage guidance to help the agent understand
 * how to utilize this context effectively.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export default function (pi: ExtensionAPI) {
  let isFirstPrompt = true;

  pi.on("session_start", async (_event, _ctx) => {
    isFirstPrompt = true;
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!isFirstPrompt) return;
    isFirstPrompt = false;

    const contextParts: string[] = [];

    // Current working directory
    const cwd = process.cwd();
    contextParts.push(
      `## Current Working Directory\n` +
        `\`${cwd}\`\n\n` +
        `> Use this as the base path for all file operations. When referencing files, ` +
        `use paths relative to this directory.`
    );

    // Last 10 git commits (title only)
    try {
      const gitLog = execSync(
        'git log -10 --pretty=format:"%h %s" --no-merges 2>/dev/null',
        { encoding: "utf-8", timeout: 5000, cwd }
      ).trim();
      if (gitLog) {
        contextParts.push(
          `## Recent Git Commits (Last 10)\n` +
            `\`\`\`\n${gitLog}\n\`\`\`\n\n` +
            `> These commits show the recent development activity. Use this context to ` +
            `understand what has been recently worked on, identify related changes, or ` +
            `avoid breaking recent modifications.`
        );
      }
    } catch {
      // Not a git repository or git not available
    }

    // README.md (full content)
    const readmeCandidates = ["README.md", "readme.md", "README", "readme"];
    for (const readmeFile of readmeCandidates) {
      const readmePath = `${cwd}/${readmeFile}`;
      if (existsSync(readmePath)) {
        try {
          const content = readFileSync(readmePath, "utf-8");
          contextParts.push(
            `## README.md\n` +
              `\`\`\`markdown\n${content}\n\`\`\`\n\n` +
              `> The README contains project overview, setup instructions, and usage guidelines. ` +
              `Refer to it for understanding the project structure, available features, and ` +
              `how to work with this codebase.`
          );
          break;
        } catch {
          // Skip if file cannot be read
        }
      }
    }

    if (contextParts.length === 0) return;

    const injectedContext =
      `# Session Startup Context\n\n` +
      `This context is automatically injected at session start to help you understand ` +
      `the project's current state, recent changes, and overall structure.\n\n` +
      `${contextParts.join("\n\n")}\n\n` +
      `---\n` +
      `_End of startup context._`;

    // Append to system prompt instead of injecting a user message
    // This way it's sent to LLM but not displayed in TUI
    return {
      systemPrompt: `${event.systemPrompt}\n\n${injectedContext}`,
    };
  });
}
