import assert from "node:assert/strict";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const repoRoot = process.cwd();
const distRoot = resolve(repoRoot, "extension/dist");
const manifestPath = join(distRoot, "manifest.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assertInsideDist(path, description) {
  const resolved = resolve(path);
  const rel = relative(distRoot, resolved);
  assert.ok(rel && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel),
    description + " resolves outside extension/dist: " + resolved);
  assert.ok(existsSync(resolved), description + " does not exist: " + resolved);
  return realpathSync(resolved);
}

assert.ok(existsSync(manifestPath), "Build output is missing manifest.json.");
const manifest = readJson(manifestPath);
assert.equal(manifest.manifest_version, 3, "Expected a Manifest V3 extension.");
assert.ok(Array.isArray(manifest.permissions), "Manifest permissions must be an array.");
assert.deepEqual(manifest.host_permissions ?? [], [], "Broad host permissions are not allowed in this build.");
assert.deepEqual(manifest.content_scripts ?? [], [], "Content scripts are not allowed in this build.");
assert.ok(!manifest.permissions.includes("scripting"), "The scripting permission must not be present.");

assert.ok(manifest.background?.service_worker, "Manifest must specify the background service worker.");
assertInsideDist(join(distRoot, manifest.background.service_worker), "Background service worker");

assert.ok(manifest.side_panel?.default_path, "Manifest must specify the side panel HTML.");
const panelPath = assertInsideDist(join(distRoot, manifest.side_panel.default_path), "Side-panel HTML");
const html = readFileSync(panelPath, "utf8");
const resourceRefs = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);

assert.ok(resourceRefs.length > 0, "Side-panel HTML must reference its script and stylesheet.");
for (const resource of resourceRefs) {
  if (/^(?:https?:|data:|blob:|#)/i.test(resource)) continue;
  const resolved = resource.startsWith("/")
    ? join(distRoot, resource.replace(/^\/+/, ""))
    : resolve(dirname(panelPath), resource);
  assertInsideDist(resolved, "Side-panel resource " + resource);
}

const jsResources = resourceRefs.filter((ref) => /\.m?js(?:[?#].*)?$/i.test(ref));
assert.ok(jsResources.length > 0, "Side-panel HTML must include its built JavaScript bundle.");

for (const jsRef of jsResources) {
  const jsPath = jsRef.startsWith("/")
    ? join(distRoot, jsRef.replace(/^\/+/, ""))
    : resolve(dirname(panelPath), jsRef);
  const bundle = readFileSync(jsPath, "utf8");
  assert.ok(bundle.length > 0, "Side-panel bundle is empty: " + jsRef);
}

console.log("Extension build verification passed: Manifest V3, worker, side panel, local resources, and restricted permissions.");
