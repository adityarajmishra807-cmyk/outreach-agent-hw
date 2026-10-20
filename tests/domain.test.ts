import { describe, expect, it } from "vitest";
import {
  canTransitionCampaign,
  normalizeBusinessName,
  normalizeInstagramUsername,
  normalizeWebsiteDomain,
  transitionCampaign,
  validateCampaignConfig,
  type CampaignConfig
} from "../packages/shared/src/index";

const validConfig: CampaignConfig = {
  name: "Dehradun gyms",
  niche: "Gyms",
  location: "Dehradun",
  serviceOffer: "Website design and development",
  targetCount: 10,
  sourceConfig: { csvImport: true, businessWebsites: false, metaAdLibrary: false, instagram: false },
  demoExists: false
};

describe("campaign validation", () => {
  it("accepts valid targets from 1 through 100", () => {
    expect(validateCampaignConfig(validConfig)).toEqual([]);
    expect(validateCampaignConfig({ ...validConfig, targetCount: 100 })).toEqual([]);
    expect(validateCampaignConfig({ ...validConfig, targetCount: 1 })).toEqual([]);
  });

  it("rejects invalid target counts and empty source selection", () => {
    expect(validateCampaignConfig({ ...validConfig, targetCount: 101 })).toContain("Target count must be an integer between 1 and 100.");
    expect(validateCampaignConfig({ ...validConfig, targetCount: 0 })).toContain("Target count must be an integer between 1 and 100.");
    expect(validateCampaignConfig({ ...validConfig, sourceConfig: { csvImport: false, businessWebsites: false, metaAdLibrary: false, instagram: false } })).toContain("Enable at least one lead source.");
  });
});

describe("campaign state transitions", () => {
  it("allows a queued campaign to run, pause, and resume", () => {
    expect(canTransitionCampaign("queued", "running")).toBe(true);
    expect(transitionCampaign({ status: "queued" as const }, "running").status).toBe("running");
    expect(transitionCampaign({ status: "running" as const }, "paused").status).toBe("paused");
    expect(transitionCampaign({ status: "paused" as const }, "running").status).toBe("running");
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransitionCampaign("completed", "running")).toBe(false);
    expect(() => transitionCampaign({ status: "completed" as const }, "running")).toThrow("Invalid campaign transition");
  });
});

describe("normalization", () => {
  it("normalizes business names and Instagram handles", () => {
    expect(normalizeBusinessName("  Café—North  ")).toBe("cafe north");
    expect(normalizeInstagramUsername("@@ExampleGym")).toBe("examplegym");
  });

  it("normalizes valid domains and rejects invalid URL input", () => {
    expect(normalizeWebsiteDomain("https://www.Example.com/path?utm_source=x")).toBe("example.com");
    expect(normalizeWebsiteDomain("not a valid URL %%")).toBeNull();
  });
});
