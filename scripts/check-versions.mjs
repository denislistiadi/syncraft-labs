#!/usr/bin/env node
/**
 * Guards the release metadata before a tag is cut.
 *
 * Verifies that the root version, every publishable workspace, internal
 * dependency ranges, and both changelogs agree on the same version.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function fail(message) {
  console.error(`[release:check] ${message}`);
  process.exitCode = 1;
}

const rootPackage = readJson("package.json");
const version = rootPackage.version;
const packagePaths = [
  "packages/core/package.json",
  "packages/react/package.json",
  "packages/vue/package.json",
  "apps/docs/package.json",
];

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`root version "${version}" is not a valid semver version`);
}

for (const relativePath of packagePaths) {
  const pkg = readJson(relativePath);
  if (pkg.version !== version) {
    fail(`${relativePath} is ${pkg.version}, expected ${version}`);
  }
}

for (const relativePath of ["packages/react/package.json", "packages/vue/package.json"]) {
  const pkg = readJson(relativePath);
  const dependency = pkg.dependencies?.["@syncraft-labs/core"];
  if (dependency !== version) {
    fail(`${relativePath} depends on @syncraft-labs/core@${dependency}, expected ${version}`);
  }
}

for (const relativePath of ["apps/demo-web/package.json", "apps/demo-api/package.json"]) {
  const pkg = readJson(relativePath);
  for (const [name, dependency] of Object.entries(pkg.dependencies ?? {})) {
    if (name.startsWith("@syncraft-labs/") && dependency !== version) {
      fail(`${relativePath} depends on ${name}@${dependency}, expected ${version}`);
    }
  }
}

for (const relativePath of ["CHANGELOG.md", "apps/docs/src/content/docs/reference/changelog.md"]) {
  const changelog = readFileSync(join(root, relativePath), "utf8");
  if (!changelog.includes(`## [${version}]`)) {
    fail(`${relativePath} has no "## [${version}]" section`);
  }
}

if (process.exitCode) {
  console.error(`[release:check] Failed for version ${version}`);
} else {
  console.log(`[release:check] All release metadata matches ${version}`);
}
