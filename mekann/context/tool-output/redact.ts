export interface RedactionPattern {
	name: string;
	pattern: RegExp;
	replacement: string;
}

export const SECRET_REDACTION_PATTERNS: RedactionPattern[] = [
	{ name: "authorization-bearer", pattern: /\b(Authorization\s*:\s*Bearer\s+)[^\s\r\n]+/gi, replacement: "$1[REDACTED]" },
	{ name: "api-key-header", pattern: /\b((?:x-api-key|api[_-]?key)\s*[:=]\s*)[^\s&\r\n]+/gi, replacement: "$1[REDACTED]" },
	{ name: "query-token", pattern: /\b(token|password|secret)=([^\s&]+)/gi, replacement: "$1=[REDACTED]" },
	{ name: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/g, replacement: "[REDACTED_AWS_ACCESS_KEY]" },
	{ name: "github-token", pattern: /\b(?:ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+)\b/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
	{ name: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g, replacement: "[REDACTED_OPENAI_KEY]" },
	{ name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, replacement: "[REDACTED_ANTHROPIC_KEY]" },
	{ name: "env-secret", pattern: /^([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*).+$/gim, replacement: "$1[REDACTED]" },
];

export function redactSecrets(text: string): { text: string; redacted: boolean } {
	let out = text;
	for (const rule of SECRET_REDACTION_PATTERNS) out = out.replace(rule.pattern, rule.replacement);
	return { text: out, redacted: out !== text };
}
