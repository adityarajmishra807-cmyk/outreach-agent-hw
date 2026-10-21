import { describe, expect, it } from "vitest";
import type { Campaign, QueueTask } from "../packages/shared/src/index";
import {
  buildCsvImportCommit,
  createEmptyExtensionState,
  exportCsvExceptions
} from "../packages/shared/src/import-workflow";
import { createExtensionStateStore, EXTENSION_STATE_STORAGE_KEY, type StorageAreaLike } from "../extension/src/state-store";

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "campaign-1",
    name: "Dehradun gyms",
    niche: "Gyms",
    location: "Dehradun",
    serviceOffer: "Website design and development",
    targetCount: 10,
    sourceConfig: { csvImport: true, businessWebsites: false, metaAdLibrary: false, instagram: false },
    demoExists: false,
    status: "queued",
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
    ...overrides
  };
}

function makeStorage(seed?: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(seed ?? {}));
  let failNextSet = false;

  const area: StorageAreaLike = {
    async get(key) {
      return Object.fromEntries(data.has(key) ? [[key, data.get(key)]] : []);
    },
    async set(items) {
      if (failNextSet) {
        failNextSet = false;
        throw new Error("Simulated quota/write failure");
      }
      for (const [key, value] of Object.entries(items)) data.set(key, structuredClone(value));
    }
  };

  return {
    area,
    peek(key: string) { return data.get(key); },
    failNextWrite() { failNextSet = true; }
  };
}

function idFactory(prefix = "id") {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

const sampleCsv = [
  "businessName,location,website,instagramUsername,sourceUrl",
  "North Gym,Dehradun,https://north.example,northgym,https://north.example",
  "North Gym,Dehradun,https://north.example,northgym,https://directory.example/north",
  ",Dehradun,,,",
  "Another Gym,Dehradun,https://another.example,anothergym,"
].join("\n");

describe("extension state persistence", () => {
  it("loads the Phase 1 storage format and initializes missing Phase 2 fields", async () => {
    const legacyCampaign = campaign();
    const legacyTask: QueueTask = {
      id: "task-1",
      campaignId: legacyCampaign.id,
      leadId: "lead-legacy",
      status: "pending",
      attempts: 0,
      createdAt: legacyCampaign.createdAt,
      updatedAt: legacyCampaign.updatedAt
    };
    const storage = makeStorage({
      [EXTENSION_STATE_STORAGE_KEY]: {
        campaigns: [legacyCampaign],
        activeCampaignId: legacyCampaign.id,
        queueTasks: [legacyTask]
      }
    });
    const store = createExtensionStateStore(storage.area);

    const loaded = await store.load();

    expect(loaded.campaigns).toEqual([legacyCampaign]);
    expect(loaded.activeCampaignId).toBe(legacyCampaign.id);
    expect(loaded.queueTasks).toEqual([legacyTask]);
    expect(loaded.leads).toEqual([]);
    expect(loaded.imports).toEqual([]);
  });

  it("round-trips campaigns, queue tasks, leads, and import history as one state record", async () => {
    const state = createEmptyExtensionState();
    state.campaigns = [campaign()];
    state.activeCampaignId = "campaign-1";
    state.queueTasks = [{
      id: "task-1", campaignId: "campaign-1", leadId: "lead-1", status: "pending",
      attempts: 0, createdAt: "2026-10-22T00:00:00.000Z", updatedAt: "2026-10-22T00:00:00.000Z"
    }];
    state.sourceEvents = [{
      id: "source-event-1",
      campaignId: "campaign-1",
      occurredAt: "2026-10-22T00:30:00.000Z",
      sourceType: "business_website",
      businessName: "North Gym",
      sourceUrl: "https://north.example",
      action: "created",
      leadId: "lead-1",
      reviewFlags: []
    }];
    const committed = buildCsvImportCommit(state, "campaign-1", "leads.csv", sampleCsv, {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory("new")
    });
    const withResearch = {
      ...committed.state,
      researchNotes: [{
        id: "research-1",
        campaignId: "campaign-1",
        leadId: committed.state.leads[0].id,
        recordedAt: "2026-10-22T01:30:00.000Z",
        category: "services_offered" as const,
        observation: "The service page lists personal training.",
        evidenceUrl: "https://north.example/services",
        confidence: "needs_verification" as const,
        potentialOpportunity: "A clearer enquiry path may help visitors."
      }]
    };
    const storage = makeStorage();
    const store = createExtensionStateStore(storage.area);

    await store.save(withResearch);
    const restored = await store.load();

    expect(restored).toEqual(withResearch);
    expect(restored.campaigns).toHaveLength(1);
    expect(restored.queueTasks).toHaveLength(1);
    expect(restored.leads).toHaveLength(2);
    expect(restored.imports).toHaveLength(1);
    expect(restored.sourceEvents).toHaveLength(1);
    expect(restored.sourceEvents[0].sourceUrl).toBe("https://north.example");
    expect(restored.researchNotes).toHaveLength(1);
    expect(restored.researchNotes[0].evidenceUrl).toBe("https://north.example/services");
  });

  it("keeps the previously saved state when the storage write fails", async () => {
    const storage = makeStorage();
    const store = createExtensionStateStore(storage.area);
    const original = createEmptyExtensionState();
    original.campaigns = [campaign()];
    await store.save(original);

    const changed = { ...original, activeCampaignId: "campaign-1" };
    storage.failNextWrite();
    await expect(store.save(changed)).rejects.toThrow("Simulated quota/write failure");
    await expect(store.load()).resolves.toEqual(original);
  });
});

describe("CSV import commit transaction", () => {
  it("commits the exact previewed canonical result, records the batch, and is idempotent on re-import", () => {
    const initial = createEmptyExtensionState();
    initial.campaigns = [campaign()];
    initial.activeCampaignId = "campaign-1";

    const first = buildCsvImportCommit(initial, "campaign-1", "test-leads.csv", sampleCsv, {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory("first")
    });

    expect(first.importResult).toMatchObject({
      totalRows: 4,
      acceptedRows: 3,
      rejectedRows: 1,
      createdCount: 2,
      mergedCount: 1,
      duplicateCount: 0,
      needsReviewCount: 0,
      overCapacityCount: 0,
      currentLeadCount: 0,
      finalLeadCount: 2
    });
    expect(first.state.leads).toHaveLength(2);
    expect(first.state.leads.find((lead) => lead.instagramUsername === "northgym")?.sourceEvidence).toHaveLength(2);
    expect(first.state.imports).toHaveLength(1);
    expect(initial.leads).toEqual([]);
    expect(initial.imports).toEqual([]);

    const repeated = buildCsvImportCommit(first.state, "campaign-1", "test-leads.csv", sampleCsv, {
      now: "2026-10-22T01:05:00.000Z",
      createId: idFactory("repeat")
    });
    expect(repeated.importResult.duplicateCount).toBe(3);
    expect(repeated.importResult.createdCount).toBe(0);
    expect(repeated.importResult.mergedCount).toBe(0);
    expect(repeated.state.leads).toHaveLength(2);
    expect(repeated.state.leads.map((lead) => lead.id)).toEqual(first.state.leads.map((lead) => lead.id));
    expect(repeated.state.imports).toHaveLength(2);
  });

  it("enforces capacity while still allowing duplicates and merges", () => {
    const initial = createEmptyExtensionState();
    initial.campaigns = [campaign({ targetCount: 2 })];
    initial.activeCampaignId = "campaign-1";
    const csv = [
      "businessName,website,instagramUsername,sourceUrl",
      "North Gym,north.example,northgym,https://directory.example/1",
      "Another Gym,another.example,anothergym,https://directory.example/2",
      "Overflow Gym,overflow.example,overflowgym,https://directory.example/3"
    ].join("\n");

    const result = buildCsvImportCommit(initial, "campaign-1", "capacity.csv", csv, {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory("capacity")
    });

    expect(result.importResult.createdCount).toBe(2);
    expect(result.importResult.overCapacityCount).toBe(1);
    expect(result.importResult.finalLeadCount).toBe(2);
    expect(result.state.leads.filter((lead) => lead.campaignId === "campaign-1")).toHaveLength(2);
  });

  it("exports rejected and over-capacity rows with row numbers and reasons", () => {
    const initial = createEmptyExtensionState();
    initial.campaigns = [campaign({ targetCount: 1 })];
    const csv = [
      "businessName,location,website",
      "North Gym,Dehradun,north.example",
      "Overflow Gym,Dehradun,overflow.example",
      ",Dehradun,"
    ].join("\n");

    const exported = exportCsvExceptions(initial, "campaign-1", "campaign leads.csv", csv, {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory("export")
    });

    expect(exported.fileName).toBe("campaign_leads-exceptions.csv");
    expect(exported.exceptionCount).toBe(2);
    expect(exported.csvText).toContain("_import_status");
    expect(exported.csvText).toContain("over_capacity");
    expect(exported.csvText).toContain("rejected");
    expect(exported.csvText).toContain("campaign target of 1 leads is full");
    expect(exported.csvText).toContain("Business name is required.");
  });

  it("does not mutate the caller's state if validation fails before commit", () => {
    const initial = createEmptyExtensionState();
    initial.campaigns = [campaign({ sourceConfig: { csvImport: false, businessWebsites: false, metaAdLibrary: false, instagram: true } })];
    const before = structuredClone(initial);

    expect(() => buildCsvImportCommit(initial, "campaign-1", "leads.csv", sampleCsv, {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory("never-used")
    })).toThrow(/CSV \/ manual import was not enabled/i);
    expect(initial).toEqual(before);
  });

  it("refuses to commit a file with no importable rows", () => {
    const initial = createEmptyExtensionState();
    initial.campaigns = [campaign()];
    expect(() => buildCsvImportCommit(initial, "campaign-1", "empty.csv", "businessName\n\n", {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory()
    })).toThrow("The CSV contains no valid business rows to import.");
  });
});
