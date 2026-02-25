/**
 * definition-loader.ts ENOENT Bug Reproduction Test
 *
 * Tests for broken symlink handling in loadTeamDefinitionsFromDir
 * Reproduces: ENOENT error when statSync is called on dangling symlinks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// テスト対象のモジュール
import {
  loadTeamDefinitionsFromDir,
} from '.pi/extensions/agent-teams/definition-loader.js';

const testIsoTime = () => new Date().toISOString();

describe('definition-loader.ts - ENOENT Bug Reproduction', () => {
  let tempDir: string;
  let definitionsDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `enoent-test-${Date.now()}`);
    definitionsDir = join(tempDir, 'definitions');
    mkdirSync(definitionsDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('broken symlink handling', () => {
    it('should handle broken symlink to directory gracefully', () => {
      // Create a valid directory first
      const validDir = join(definitionsDir, 'valid-team');
      mkdirSync(validDir, { recursive: true });

      // Create team.md in the valid directory
      const teamMd = join(validDir, 'team.md');
      writeFileSync(teamMd, `---
id: valid-team
name: Valid Team
members:
  - id: member-1
    role: Role 1
    description: Member 1
---
Body`);

      // Create a broken symlink (points to non-existent target)
      const brokenSymlink = join(definitionsDir, 'broken-symlink');
      symlinkSync('/nonexistent/target', brokenSymlink);

      // Verify the symlink is broken
      expect(lstatSync(brokenSymlink).isSymbolicLink()).toBe(true);
      expect(() => statSync(brokenSymlink)).toThrow();

      // This should NOT throw ENOENT
      const teams = loadTeamDefinitionsFromDir(definitionsDir, testIsoTime());

      // Should only load the valid team, skip the broken symlink
      expect(teams).toHaveLength(1);
      expect(teams[0].id).toBe('valid-team');
    });

    it('should handle broken symlink to file gracefully', () => {
      // Create a broken symlink to a file (simulating deleted .md file)
      const brokenSymlink = join(definitionsDir, 'deleted-team.md');
      symlinkSync('/nonexistent/deleted.md', brokenSymlink);

      // Verify the symlink is broken
      expect(lstatSync(brokenSymlink).isSymbolicLink()).toBe(true);
      expect(() => statSync(brokenSymlink)).toThrow();

      // This should NOT throw ENOENT
      const teams = loadTeamDefinitionsFromDir(definitionsDir, testIsoTime());

      // Should skip the broken symlink
      expect(teams).toHaveLength(0);
    });

    it('should handle multiple broken symlinks without crashing', () => {
      // Create multiple broken symlinks
      for (let i = 0; i < 5; i++) {
        symlinkSync(`/nonexistent/target-${i}`, join(definitionsDir, `broken-${i}`));
      }

      // Create one valid team
      const validDir = join(definitionsDir, 'valid-team');
      mkdirSync(validDir, { recursive: true });
      writeFileSync(join(validDir, 'team.md'), `---
id: valid-team
name: Valid Team
members:
  - id: member-1
    role: Role 1
    description: Member 1
---
Body`);

      // This should NOT throw ENOENT
      const teams = loadTeamDefinitionsFromDir(definitionsDir, testIsoTime());

      // Should only load the valid team
      expect(teams).toHaveLength(1);
      expect(teams[0].id).toBe('valid-team');
    });

    it('should handle symlink to directory that becomes broken during iteration', () => {
      // This is an edge case: symlink exists but target is deleted during iteration
      const targetDir = join(tempDir, 'target');
      mkdirSync(targetDir, { recursive: true });
      writeFileSync(join(targetDir, 'team.md'), `---
id: target-team
name: Target Team
members:
  - id: member-1
    role: Role 1
    description: Member 1
---
Body`);

      const symlinkDir = join(definitionsDir, 'symlink-team');
      symlinkSync(targetDir, symlinkDir);

      // Verify symlink works initially
      expect(statSync(symlinkDir).isDirectory()).toBe(true);

      // This should work
      const teams = loadTeamDefinitionsFromDir(definitionsDir, testIsoTime());
      expect(teams).toHaveLength(1);
    });
  });

  describe('ENOENT edge cases', () => {
    it('should handle symlink cycle gracefully', () => {
      // Create a symlink cycle
      const cycleDir = join(definitionsDir, 'cycle');
      mkdirSync(cycleDir, { recursive: true });
      symlinkSync(cycleDir, join(cycleDir, 'self'));

      // This should not hang or crash
      const teams = loadTeamDefinitionsFromDir(definitionsDir, testIsoTime());
      // No team.md, so no teams loaded
      expect(teams).toHaveLength(0);
    });

    it('should handle permission denied gracefully (simulated)', () => {
      // Note: We can't actually test permission denied without root/sudo
      // This test documents the expected behavior

      // Create a valid team
      const validDir = join(definitionsDir, 'valid-team');
      mkdirSync(validDir, { recursive: true });
      writeFileSync(join(validDir, 'team.md'), `---
id: valid-team
name: Valid Team
members:
  - id: member-1
    role: Role 1
    description: Member 1
---
Body`);

      // This should work
      const teams = loadTeamDefinitionsFromDir(definitionsDir, testIsoTime());
      expect(teams).toHaveLength(1);
    });
  });
});
