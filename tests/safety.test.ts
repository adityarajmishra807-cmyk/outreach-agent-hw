import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = join(process.cwd(), "extension");
const manifest = JSON.parse(readFileSync(join(extensionRoot, "public/manifest.json"), "utf8")) as {
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
  background?: { service_worker?: string };
};

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(ts|html)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("extension safety baseline", () => {
  it("does not declare broad host access or content scripts in the foundation build", () => {
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.content_scripts ?? []).toEqual([]);
    expect(manifest.permissions ?? []).not.toContain("scripting");
    expect(manifest.background?.service_worker).toBe("background.js");
  });

  it("contains no programmatic click or keyboard-submit path", () => {
    const source = collectSourceFiles(join(extensionRoot, "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\.click\s*\(/i);
    expect(source).not.toMatch(/\.press\s*\(\s*["']Enter["']/i);
    expect(source).not.toMatch(/autoSend|clickSend|submitInstagramDm|sendButton/i);
  });

  it("keeps Phase 3 source intake manual-only without adding network or tab automation", () => {
    const source = collectSourceFiles(join(extensionRoot, "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/\bfetch\s*\(/i);
    expect(source).not.toMatch(/\bXMLHttpRequest\b/);
    expect(source).not.toMatch(/chrome\.tabs\.(?:create|update|query)\s*\(/i);
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.content_scripts ?? []).toEqual([]);
    const panel = readFileSync(join(extensionRoot, "src/sidepanel.html"), "utf8");
    expect(panel).toContain("This form does not open, fetch, or scrape any source");
  });
});
