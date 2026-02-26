#!/usr/bin/env npx tsx

/**
 * Reference Fixer Script
 *
 * Fixes broken internal references in Markdown files.
 * Detects and corrects relative paths to .pi/ directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

interface ReferenceIssue {
  filePath: string;
  lineNumber: number;
  originalLink: string;
  expectedLink: string;
  matchedText: string;
  reason: string;
}

/**
 * Calculate correct relative path from source to target
 */
function calculateCorrectPath(sourceFile: string, targetPath: string): string {
  const sourceDir = path.dirname(sourceFile);
  const targetFullPath = path.resolve(process.cwd(), targetPath);

  // Check if target exists
  if (!fs.existsSync(targetFullPath)) {
    return null;
  }

  const relativePath = path.relative(sourceDir, targetFullPath);
  return relativePath;
}

/**
 * Fix reference path based on file location
 */
function fixReferencePath(filePath: string, link: string): { fixed: string; reason: string } {
  // Convert to relative path from project root for pattern matching
  const rootDir = process.cwd();
  const relativePath = path.relative(rootDir, filePath);

  // Pattern 1: ../.pi/ from docs/ subdirectory files (docs/XX-category/*.md)
  // ../.pi/ goes to docs/.pi/ (WRONG), should be ../../.pi/ (go to root, then .pi/)
  if (relativePath.match(/^docs\/[^/]+\//) && link.startsWith('../.pi/')) {
    return {
      fixed: link.replace('../.pi/', '../../.pi/'),
      reason: 'docs/ subdirectory: ../.pi/ -> ../../.pi/'
    };
  }

  // For docs/ root files (docs/*.md), ../.pi/ is CORRECT
  // No change needed

  return { fixed: link, reason: 'no change needed' };
}

/**
 * Find all Markdown reference issues
 */
function findReferenceIssues(dir: string): ReferenceIssue[] {
  const issues: ReferenceIssue[] = [];

  function scanDirectory(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          scanDirectory(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          // Find all markdown links [text](url)
          const linkMatches = line.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g);

          for (const match of linkMatches) {
            const fullMatch = match[0];
            const linkText = match[2];

            // Only check relative paths containing .pi/
            if (linkText.includes('.pi/') && !linkText.startsWith('http')) {
              const { fixed, reason } = fixReferencePath(fullPath, linkText);

              if (fixed !== linkText) {
                issues.push({
                  filePath: fullPath,
                  lineNumber: i + 1,
                  originalLink: linkText,
                  expectedLink: fixed,
                  matchedText: fullMatch,
                  reason
                });
              }
            }
          }

          // Find frontmatter references like related: [../.pi/skills/...]
          const frontmatterMatches = line.matchAll(/(?:related:)\s*\[([^\]]+)\]/g);

          for (const match of frontmatterMatches) {
            const fullMatch = match[0];
            const content = match[1];

            // Split by comma to get individual paths
            const paths = content.split(',').map(p => p.trim());

            for (const linkPath of paths) {
              // Only check relative paths containing .pi/
              if (linkPath.includes('.pi/') && !linkPath.startsWith('http')) {
                const { fixed, reason } = fixReferencePath(fullPath, linkPath);

                if (fixed !== linkPath) {
                  issues.push({
                    filePath: fullPath,
                    lineNumber: i + 1,
                    originalLink: linkPath,
                    expectedLink: fixed,
                    matchedText: linkPath,
                    reason
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  scanDirectory(dir);
  return issues;
}

/**
 * Fix reference issues in files
 */
function fixReferenceIssues(issues: ReferenceIssue[]): { fixed: number; errors: string[] } {
  let fixedCount = 0;
  const errors: string[] = [];

  // Group by file
  const fileGroups = new Map<string, ReferenceIssue[]>();
  for (const issue of issues) {
    const existing = fileGroups.get(issue.filePath) || [];
    existing.push(issue);
    fileGroups.set(issue.filePath, existing);
  }

  for (const [filePath, fileIssues] of fileGroups) {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      // Process issues (in reverse line order to preserve line numbers)
      for (const issue of fileIssues.sort((a, b) => b.lineNumber - a.lineNumber)) {
        const lineIndex = issue.lineNumber - 1;
        const oldLine = lines[lineIndex];
        const newLine = oldLine.replace(issue.matchedText, issue.matchedText.replace(issue.originalLink, issue.expectedLink));

        if (oldLine !== newLine) {
          lines[lineIndex] = newLine;
          fixedCount++;
        }
      }

      // Write back
      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    } catch (error) {
      errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { fixed: fixedCount, errors };
}

/**
 * Verify that fixed links actually exist
 */
function verifyLinks(issues: ReferenceIssue[]): { valid: number; invalid: ReferenceIssue[] } {
  let validCount = 0;
  const invalidIssues: ReferenceIssue[] = [];

  const rootDir = process.cwd();

  for (const issue of issues) {
    const sourceDir = path.dirname(issue.filePath);
    const expectedFullPath = path.resolve(sourceDir, issue.expectedLink);

    if (fs.existsSync(expectedFullPath)) {
      validCount++;
    } else {
      // Try resolving from root if it starts with .pi/
      if (issue.expectedLink.startsWith('.pi/')) {
        const rootFullPath = path.resolve(rootDir, issue.expectedLink);
        if (fs.existsSync(rootFullPath)) {
          validCount++;
          continue;
        }
      }
      invalidIssues.push(issue);
    }
  }

  return { valid: validCount, invalid: invalidIssues };
}

/**
 * Main function
 */
function main() {
  const docsDir = path.resolve(process.cwd(), 'docs');

  console.log('='.repeat(60));
  console.log('Reference Fixer Script');
  console.log('='.repeat(60));
  console.log();

  console.log(`Scanning directory: ${docsDir}`);
  console.log();

  // Find all issues
  console.log('Finding reference issues...');
  const issues = findReferenceIssues(docsDir);

  if (issues.length === 0) {
    console.log('No reference issues found.');
    console.log();
    return;
  }

  console.log(`Found ${issues.length} reference issue(s):`);
  console.log();

  for (const issue of issues) {
    console.log(`  ${issue.filePath}:${issue.lineNumber}`);
    console.log(`    ${issue.originalLink} -> ${issue.expectedLink}`);
    console.log(`    Reason: ${issue.reason}`);
    console.log();
  }

  // Verify expected paths exist
  console.log('Verifying expected paths...');
  const verification = verifyLinks(issues);
  console.log(`  Valid: ${verification.valid}`);
  console.log(`  Invalid: ${verification.invalid.length}`);

  if (verification.invalid.length > 0) {
    console.log();
    console.log('Invalid expected paths:');
    for (const issue of verification.invalid) {
      console.log(`  ${issue.filePath}:${issue.lineNumber} -> ${issue.expectedLink} (not found)`);
    }
  }
  console.log();

  // Ask for confirmation
  if (process.argv.includes('--dry-run')) {
    console.log('Dry run mode. No changes will be made.');
    console.log();
    return;
  }

  console.log('Fixing references...');
  const result = fixReferenceIssues(issues);

  console.log(`  Fixed: ${result.fixed} reference(s)`);
  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    for (const error of result.errors) {
      console.log(`    ${error}`);
    }
  }
  console.log();

  console.log('Done!');
  console.log();
}

// Run
main();
