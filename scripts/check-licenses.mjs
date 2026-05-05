#!/usr/bin/env node
import { readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const NODE_MODULES = path.join(ROOT, "node_modules");
const ALLOWED_LICENSES = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "ISC",
  "MIT",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);

const manifests = await findPackageManifests(NODE_MODULES, new Set()).catch((error) => {
  if (error && error.code === "ENOENT") {
    process.stderr.write("node_modules is missing. Run pnpm install first.\n");
    process.exit(1);
  }
  throw error;
});
const seen = new Set();
const failures = [];

for (const manifestPath of manifests.sort()) {
  const canonicalPath = await realpath(manifestPath);
  if (seen.has(canonicalPath)) {
    continue;
  }
  seen.add(canonicalPath);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (!isPackageManifest(manifest)) {
    continue;
  }

  if (manifest.private === true || String(manifest.name ?? "").startsWith("@openvoice/")) {
    continue;
  }

  const license = readLicense(manifest);
  if (!license || !isAllowedLicenseExpression(license)) {
    failures.push({
      license: license ?? "<missing>",
      name: String(manifest.name ?? path.dirname(manifestPath)),
      version: String(manifest.version ?? "<unknown>"),
    });
  }
}

if (failures.length > 0) {
  process.stderr.write("Disallowed or missing dependency licenses found:\n");
  for (const failure of failures) {
    process.stderr.write(`- ${failure.name}@${failure.version}: ${failure.license}\n`);
  }
  process.exit(1);
}

process.stdout.write(`Checked ${seen.size} package manifests. Licenses are allowed.\n`);

async function findPackageManifests(directory, visitedDirectories) {
  const canonicalDirectory = await realpath(directory);
  if (visitedDirectories.has(canonicalDirectory)) {
    return [];
  }
  visitedDirectories.add(canonicalDirectory);

  const entries = await readdir(directory, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    if (entry.name === ".bin") {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === "package.json") {
      result.push(entryPath);
      continue;
    }

    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    result.push(...(await findPackageManifests(entryPath, visitedDirectories)));
  }

  return result;
}

function readLicense(manifest) {
  if (typeof manifest.license === "string") {
    return manifest.license;
  }

  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((license) => (typeof license === "string" ? license : license?.type))
      .filter(Boolean)
      .join(" OR ");
  }

  return null;
}

function isPackageManifest(manifest) {
  return (
    typeof manifest.license === "string" ||
    (typeof manifest.name === "string" && typeof manifest.version === "string")
  );
}

function isAllowedLicenseExpression(expression) {
  const normalized = expression
    .replaceAll("(", "")
    .replaceAll(")", "")
    .replace(/\s+WITH\s+[\w.-]+/g, "")
    .trim();
  const parts = normalized.split(/\s+(?:AND|OR)\s+/);

  return parts.length > 0 && parts.every((part) => ALLOWED_LICENSES.has(part.trim()));
}
