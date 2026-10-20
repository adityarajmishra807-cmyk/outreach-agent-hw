import { describe, expect, it } from "vitest";
import {
  canTransitionCampaign,
  canTransitionQueueTask,
  countQueueTasks,
  enqueueQueueTask,
  normalizeBusinessName,
  normalizeInstagramUsername,
  normalizeWebsiteDomain,
  reconcileInterruptedQueueTasks,
  transitionCampaign,
  transitionQueueTask,
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

describe("queue tasks", () => {
  const firstInput = { id: "task-1", campaignId: "campaign-1", leadId: "lead-1" };

  it("creates an idempotent task for a unique campaign and lead", () => {
    const first = enqueueQueueTask([], firstInput, 2, "2026-10-20T12:00:00.000Z");
    expect(first.created).toBe(true);
    expect(first.task.status).toBe("pending");
    expect(first.task.attempts).toBe(0);

    const duplicate = enqueueQueueTask(first.tasks, { ...firstInput, id: "task-duplicate" }, 2);
    expect(duplicate.created).toBe(false);
    expect(duplicate.task.id).toBe("task-1");
    expect(duplicate.tasks).toHaveLength(1);
  });

  it("enforces the campaign target and global maximum", () => {
    const one = enqueueQueueTask([], firstInput, 1);
    expect(() => enqueueQueueTask(one.tasks, { id: "task-2", campaignId: "campaign-1", leadId: "lead-2" }, 1))
      .toThrow("Campaign lead queue is at its configured limit.");
    expect(() => enqueueQueueTask([], firstInput, 101)).toThrow("Campaign target must be an integer between 1 and 100.");
  });

  it("validates transitions and increments attempts only when processing starts", () => {
    const pending = enqueueQueueTask([], firstInput, 10).task;
    expect(canTransitionQueueTask("pending", "processing")).toBe(true);
    const processing = transitionQueueTask(pending, "processing", { now: "2026-10-20T12:01:00.000Z" });
    expect(processing.attempts).toBe(1);
    expect(transitionQueueTask(processing, "completed").status).toBe("completed");
    expect(() => transitionQueueTask(processing, "pending")).toThrow("Invalid queue task transition");
  });

  it("routes interrupted processing tasks to review instead of blindly repeating them", () => {
    const pending = enqueueQueueTask([], firstInput, 10).task;
    const processing = transitionQueueTask(pending, "processing");
    const reconciled = reconcileInterruptedQueueTasks([processing], "2026-10-20T12:02:00.000Z");
    expect(reconciled[0].status).toBe("needs_review");
    expect(reconciled[0].lastError).toMatch(/Interrupted while processing/);
  });

  it("counts only tasks belonging to the selected campaign", () => {
    const one = enqueueQueueTask([], firstInput, 10);
    const two = enqueueQueueTask(one.tasks, { id: "task-2", campaignId: "campaign-2", leadId: "lead-2" }, 10);
    expect(countQueueTasks(two.tasks, "campaign-1").pending).toBe(1);
    expect(countQueueTasks(two.tasks, "campaign-2").pending).toBe(1);
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
