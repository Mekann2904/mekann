#!/usr/bin/env node
// Non-interactive git rebase message editor for commit-rewrite.
// Each "reword" invocation pops the next pre-generated message from the queue
// (built by the sequence editor in stable todo order) and writes it as the new
// commit message. On any error the original message is left untouched.
const fs = require("fs");
const t = process.argv[2];
if (!t) process.exit(0);
const queueFile = process.env.COMMIT_REWRITE_QUEUE_FILE;
if (!queueFile) process.exit(0);
try {
	const queue = JSON.parse(fs.readFileSync(queueFile, "utf8"));
	const msg = queue.shift();
	fs.writeFileSync(queueFile, JSON.stringify(queue));
	if (typeof msg === "string" && msg.length > 0) fs.writeFileSync(t, msg + "\n");
} catch {
	// best-effort; leave original message intact
}
