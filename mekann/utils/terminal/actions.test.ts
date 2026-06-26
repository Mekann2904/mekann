import { describe, expect, it } from "vitest";
import { resolveShell, shellArgs, terminalActionArgv, terminalActionLabel } from "./actions.js";

describe("terminalActionLabel", () => {
	it("joins argv for argv-mode actions", () => {
		expect(terminalActionLabel({ mode: "argv", argv: ["lazygit", "-p"] })).toBe("lazygit -p");
	});

	it("returns the raw command for shell-mode actions", () => {
		expect(terminalActionLabel({ mode: "shell", command: "git status" })).toBe("git status");
	});
});

describe("resolveShell (SHELL whitelist — IC-105/138)", () => {
	it("accepts /bin/ shells", () => {
		expect(resolveShell("/bin/bash")).toBe("/bin/bash");
		expect(resolveShell("/bin/zsh")).toBe("/bin/zsh");
		expect(resolveShell("/bin/sh")).toBe("/bin/sh");
	});

	it("accepts /usr/bin/ shells", () => {
		expect(resolveShell("/usr/bin/bash")).toBe("/usr/bin/bash");
		expect(resolveShell("/usr/bin/fish")).toBe("/usr/bin/fish");
	});

	it("falls back to /bin/sh for an attacker-controlled path", () => {
		// A hijacked/compromised launcher could point SHELL at an arbitrary
		// executable; shell-mode actions must never exec it.
		expect(resolveShell("/tmp/malware")).toBe("/bin/sh");
		expect(resolveShell("/home/user/evil-sh")).toBe("/bin/sh");
		expect(resolveShell("./relative-sh")).toBe("/bin/sh");
		expect(resolveShell("bash")).toBe("/bin/sh");
	});

	it("falls back to /bin/sh when unset or blank", () => {
		expect(resolveShell(undefined)).toBe("/bin/sh");
		expect(resolveShell("")).toBe("/bin/sh");
		expect(resolveShell("   ")).toBe("/bin/sh");
	});

	it("rejects lookalikes that only contain the prefix elsewhere", () => {
		// Must be a real path prefix, not a substring.
		expect(resolveShell("/bin/../tmp/malware")).toBe("/bin/sh");
		expect(resolveShell("/tmp//bin/evil")).toBe("/bin/sh");
	});
});

describe("shellArgs", () => {
	it("uses a login shell (-lc) for zsh/bash/fish", () => {
		expect(shellArgs("/bin/zsh", "git status")).toEqual(["-lc", "git status"]);
		expect(shellArgs("/bin/bash", "ls")).toEqual(["-lc", "ls"]);
		expect(shellArgs("/usr/bin/fish", "pwd")).toEqual(["-lc", "pwd"]);
	});

	it("uses a non-login shell (-c) otherwise", () => {
		expect(shellArgs("/bin/sh", "echo hi")).toEqual(["-c", "echo hi"]);
	});
});

describe("terminalActionArgv (uses validated SHELL)", () => {
	it("returns argv as-is for argv-mode actions", () => {
		expect(terminalActionArgv({ mode: "argv", argv: ["lazygit"] })).toEqual(["lazygit"]);
	});

	it("uses the validated SHELL for shell-mode actions", () => {
		const prev = process.env.SHELL;
		try {
			process.env.SHELL = "/tmp/malware";
			// Hijacked SHELL must be ignored — falls back to /bin/sh.
			expect(terminalActionArgv({ mode: "shell", command: "git status" })).toEqual([
				"/bin/sh",
				"-c",
				"git status",
			]);

			process.env.SHELL = "/bin/bash";
			expect(terminalActionArgv({ mode: "shell", command: "git status" })).toEqual([
				"/bin/bash",
				"-lc",
				"git status",
			]);
		} finally {
			if (prev === undefined) delete process.env.SHELL;
			else process.env.SHELL = prev;
		}
	});
});
