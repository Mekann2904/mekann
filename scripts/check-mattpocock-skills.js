#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "scripts", "mattpocock-skills.manifest.json");

const failures = [];
const warnings = [];

function rel(absPath) {
  return path.relative(root, absPath) || ".";
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(`cannot read JSON ${rel(file)}: ${error.message}`);
    return null;
  }
}

function isDirectory(file) {
  try {
    return fs.statSync(file).isDirectory();
  } catch {
    return false;
  }
}

function walkFiles(dir) {
  if (!isDirectory(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(full);
    if (entry.isFile()) return [full];
    return [];
  });
}

function hasDescriptionFrontmatter(contents) {
  return /^---\n(?=[\s\S]*?^---\n)[\s\S]*^description:\s+.+$/m.test(contents);
}

function checkImportedSkill(manifest, item) {
  const source = path.join(root, manifest.sourceRoot, item.source);
  const destination = path.join(root, manifest.destinationRoot, item.destination);
  const skillFile = path.join(destination, "SKILL.md");

  if (!isDirectory(source)) {
    failures.push(`manifest import '${item.name}' source missing: ${rel(source)}`);
  }

  if (manifest.protectedLocalSkills.includes(item.destination)) {
    failures.push(`manifest import '${item.name}' destination collides with protected local skill: ${item.destination}`);
  }

  if (!fs.existsSync(skillFile)) {
    failures.push(`imported skill '${item.name}' missing SKILL.md: ${rel(skillFile)}`);
    return;
  }

  const contents = fs.readFileSync(skillFile, "utf8");

  if (!hasDescriptionFrontmatter(contents)) {
    failures.push(`imported skill '${item.name}' SKILL.md missing description frontmatter: ${rel(skillFile)}`);
  }

  const suspiciousPatterns = [
    /\bCLAUDE\.md\b/,
    /\bClaude Code\b/,
    /\bAgent tool\b/,
    /\bTask tool\b/,
    /\bsubagent_type\s*=/,
    /\bTodoWrite\b/,
    /\bGrep\b/,
    /\bGlob\b/,
    /\bLS\b/,
    /[`"']\/(setup-matt-pocock-skills|triage|grill-with-docs|improve-codebase-architecture)\b/,
  ];

  for (const file of walkFiles(destination)) {
    if (!/\.(md|txt)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(text)) {
        warnings.push(`possible non-Pi assumption in ${rel(file)}: ${pattern}`);
      }
    }
  }
}

const manifest = readJson(manifestPath);
if (!manifest) {
  process.exitCode = 1;
  process.exit();
}

for (const key of ["sourceRoot", "destinationRoot", "imports", "protectedLocalSkills"]) {
  if (!(key in manifest)) failures.push(`manifest missing required key: ${key}`);
}

if (!Array.isArray(manifest.imports)) manifest.imports = [];
if (!Array.isArray(manifest.protectedLocalSkills)) manifest.protectedLocalSkills = [];

const importSources = new Set();
const importDestinations = new Set();
for (const item of manifest.imports) {
  if (!item.name || !item.source || !item.destination) {
    failures.push(`manifest import must include name, source, and destination: ${JSON.stringify(item)}`);
    continue;
  }
  if (importSources.has(item.source)) failures.push(`duplicate manifest source: ${item.source}`);
  if (importDestinations.has(item.destination)) failures.push(`duplicate manifest destination: ${item.destination}`);
  importSources.add(item.source);
  importDestinations.add(item.destination);
  checkImportedSkill(manifest, item);
}

const sourceRoot = path.join(root, manifest.sourceRoot || "");
if (isDirectory(sourceRoot)) {
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !importSources.has(entry.name)) {
      warnings.push(`upstream engineering skill not listed in manifest: ${entry.name}`);
    }
  }
}

if (warnings.length > 0) {
  console.warn("mattpocock skills warnings:");
  for (const warning of [...new Set(warnings)]) console.warn(`- ${warning}`);
}

if (failures.length > 0) {
  console.error("mattpocock skills check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`mattpocock skills check passed (${manifest.imports.length} imported skills)`);
