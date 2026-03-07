/**
 * path: scripts/apply-github-branch-protection.ts
 * role: GitHub の branch protection を workspace quality policy に合わせて適用する
 * why: required checks と PR gate を repo 設定に同期し、repo-level hard gate を固定するため
 * related: scripts/verify-workspace-policy.ts, .github/workflows/test.yml, README.md, docs/03-development/04-testing.md
 */

function resolveRequiredChecks(): string[] {
  const checks = [
    "compatibility",
    "security",
  ];

  if (process.env.ENABLE_WORKSPACE_QUALITY_GATES?.trim() === "true") {
    checks.unshift("quality-gates");
  }

  return checks;
}

async function applyBranchProtection(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}/protection`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/vnd.github+json",
      "user-agent": "mekann-workspace-policy",
    },
    body: JSON.stringify({
      required_status_checks: {
        strict: true,
        contexts: resolveRequiredChecks(),
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
      },
      restrictions: null,
      required_conversation_resolution: true,
      allow_force_pushes: false,
      allow_deletions: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`failed to apply branch protection for ${branch}: ${response.status} ${body}`);
  }
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();
  const branches = (process.env.GITHUB_PROTECTED_BRANCHES?.trim() || "main,master")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!token || !repository) {
    process.stdout.write("skip apply-github-branch-protection: GITHUB_TOKEN or GITHUB_REPOSITORY is missing\n");
    return;
  }

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error(`invalid GITHUB_REPOSITORY: ${repository}`);
  }

  for (const branch of branches) {
    await applyBranchProtection(token, owner, repo, branch);
  }

  process.stdout.write(`applied branch protection to ${branches.join(", ")} with checks: ${resolveRequiredChecks().join(", ")}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
