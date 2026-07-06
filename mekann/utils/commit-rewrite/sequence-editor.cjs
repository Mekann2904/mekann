#!/usr/bin/env node
// Non-interactive git rebase sequence editor for commit-rewrite.
// Rewrites only commits whose short SHA prefixes a key in the map to "reword";
// every other line stays "pick" and is left untouched. Also writes an ordered
// queue of replacement messages (in todo order) that the message editor drains.
const fs = require("fs");
const t = process.argv[2];
if (!t) process.exit(0);
const mapFile = process.env.COMMIT_REWRITE_MAP_FILE;
const queueFile = process.env.COMMIT_REWRITE_QUEUE_FILE;
if (!mapFile || !queueFile) process.exit(0);

let map = {};
try { map = JSON.parse(fs.readFileSync(mapFile, "utf8")); } catch {}
const fullShas = Object.keys(map);
const queue = [];
const out = fs.readFileSync(t, "utf8").split("\n").map((line) => {
	// Only "pick <sha> ..." lines are candidates; leave comments/exec/etc. alone.
	if (line.indexOf("pick ") !== 0) return line;
	const rest = line.slice(5);
	const sp = rest.indexOf(" ");
	const shortSha = sp === -1 ? rest : rest.slice(0, sp);
	// Match the todo's (short) SHA against a full SHA in the map by prefix.
	const fullSha = fullShas.find((k) => k.indexOf(shortSha) === 0);
	if (fullSha) {
		queue.push(map[fullSha]);
		return "reword " + rest;
	}
	return line;
});
fs.writeFileSync(t, out.join("\n"));
fs.writeFileSync(queueFile, JSON.stringify(queue));
