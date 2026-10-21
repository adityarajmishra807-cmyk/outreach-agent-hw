import { describe, expect, it } from "vitest";
import type { Campaign } from "../packages/shared/src/index";
import {
  addManualLead,
  createEmptyExtensionState,
  normalizeExtensionState,
  previewCsvImport
} from "../packages/shared/src/import-workflow";
import type { ManualLeadInput } from "../packages/shared/src/import-workflow";

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "campaign-1",
    name: "Dehradun gyms",
    niche: "Gyms",
    location: "Dehradun",
    serviceOffer: "Website design",
    targetCount: 10,
    sourceConfig: {
      csvImport: true,
      businessWebsites: true,
      metaAdLibrary: false,
      instagram: false
    },
    demoExists: false,
    status: "queued",
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
    ...overrides
  };
}

function seedState(overrides: Partial<Campaign> = {}) {
  const state = createEmptyExtensionState();
  state.campaigns = [campaign(overrides)];
  state.activeCampaignId = "campaign-1";
  return state;
}

function idFactory(prefix = "test") {
  let next = 0;
  return () => prefix + "-" + (++next);
}

const websiteLead: ManualLeadInput = {
  businessName: " North Gym ",
  location: "Dehradun",
  websiteUrl: "https://www.north.example/services",
  sourceType: "business_website",
  notes: "Website lists group training classes."
};

describe("Phase 3 manual source intake", () => {
  it("normalizes user-provided business data and preserves source evidence", () => {
    const result = addManualLead(seedState(), "campaign-1", websiteLead, {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory()
    });

    expect(result.action).toBe("created");
    expect(result.leadCount).toBe(1);
    expect(result.state.leads[0]).toMatchObject({
      businessName: "North Gym",
      normalizedName: "north gym",
      websiteUrl: "https://www.north.example/services",
      websiteDomain: "north.example",
      status: "discovered",
      sourceEvidence: [{
        sourceType: "business_website",
        sourceUrl: "https://www.north.example/services"
      }]
    });
    expect(result.state.sourceEvents[0]).toMatchObject({
      businessName: "North Gym",
      sourceType: "business_website",
      sourceUrl: "https://www.north.example/services",
      action: "created",
      leadId: result.leadId
    });
  });

  it("is idempotent for an exact repeat while recording the repeated intake event", () => {
    const first = addManualLead(seedState(), "campaign-1", websiteLead, {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory("first")
    });
    const second = addManualLead(first.state, "campaign-1", websiteLead, {
      now: "2026-10-22T01:01:00.000Z",
      createId: idFactory("second")
    });

    expect(second.action).toBe("duplicate");
    expect(second.state.leads).toHaveLength(1);
    expect(second.state.leads[0].sourceEvidence).toHaveLength(1);
    expect(second.state.sourceEvents).toHaveLength(2);
    expect(second.state.sourceEvents[0].action).toBe("duplicate");
  });

  it("requires the campaign's corresponding source toggle", () => {
    const noWebsiteAccess = seedState({ sourceConfig: {
      csvImport: true,
      businessWebsites: false,
      metaAdLibrary: false,
      instagram: false
    } });
    expect(() => addManualLead(noWebsiteAccess, "campaign-1", websiteLead, {
      createId: idFactory()
    })).toThrow("This source is disabled");

    const noInstagramAccess = seedState();
    const instagramInput: ManualLeadInput = {
      businessName: "North Gym",
      instagramUsername: "northgym",
      instagramUrl: "https://www.instagram.com/northgym/",
      sourceType: "instagram_manual"
    };
    expect(() => addManualLead(noInstagramAccess, "campaign-1", instagramInput, {
      createId: idFactory()
    })).toThrow("This source is disabled");
  });

  it("requires traceable URLs for manual Meta/Instagram/website entries", () => {
    expect(() => addManualLead(
      seedState({ sourceConfig: { csvImport: true, businessWebsites: false, metaAdLibrary: true, instagram: false } }),
      "campaign-1",
      { businessName: "North Gym", sourceType: "meta_ad_library_manual" },
      { createId: idFactory() }
    )).toThrow("Meta Ad Library URL");

    expect(() => addManualLead(
      seedState({ sourceConfig: { csvImport: true, businessWebsites: false, metaAdLibrary: false, instagram: true } }),
      "campaign-1",
      { businessName: "North Gym", sourceType: "instagram_manual" },
      { createId: idFactory() }
    )).toThrow("Instagram profile URL");
  });

  it("rejects capacity overflow and records why it was not added", () => {
    const oneLeadCampaign = seedState({ targetCount: 1 });
    const first = addManualLead(oneLeadCampaign, "campaign-1", websiteLead, {
      createId: idFactory("first")
    });
    const second = addManualLead(first.state, "campaign-1", {
      businessName: "South Gym",
      websiteUrl: "https://south.example",
      sourceType: "business_website"
    }, { createId: idFactory("second") });

    expect(second.action).toBe("over_capacity");
    expect(second.leadCount).toBe(1);
    expect(second.state.leads).toHaveLength(1);
    expect(second.state.sourceEvents[0].action).toBe("over_capacity");
    expect(second.reason).toContain("cap of 1");
  });

  it("keeps conflicting identities as separate review records with candidate links", () => {
    const first = addManualLead(seedState(), "campaign-1", {
      businessName: "North Gym",
      websiteUrl: "https://north.example",
      sourceType: "business_website"
    }, { createId: idFactory("first") });

    const conflict = addManualLead(first.state, "campaign-1", {
      businessName: "North Yoga",
      websiteUrl: "https://north.example",
      sourceType: "business_website",
      notes: "Different business name on the same domain; verify."
    }, { createId: idFactory("conflict") });

    expect(conflict.action).toBe("needs_review");
    expect(conflict.state.leads).toHaveLength(2);
    expect(conflict.state.leads[0].candidateIds).toEqual([first.leadId]);
    expect(conflict.state.sourceEvents[0].candidateIds).toEqual([first.leadId]);
  });

  it("keeps invalid optional URLs untrusted and visibly flagged", () => {
    const result = addManualLead(seedState(), "campaign-1", {
      businessName: "Odd Website Gym",
      websiteUrl: "https:// bad url",
      sourceUrl: "https:// bad url",
      sourceType: "business_website"
    }, { createId: idFactory() });

    expect(result.action).toBe("created");
    expect(result.state.leads[0].websiteUrl).toBeUndefined();
    expect(result.state.leads[0].sourceEvidence[0].sourceUrl).toBeUndefined();
    expect(result.reviewFlags).toContain("invalid_website_url");
    expect(result.reviewFlags).toContain("invalid_source_url");
  });

  it("does not accept manual entry for a terminal campaign", () => {
    expect(() => addManualLead(seedState({ status: "completed" }), "campaign-1", websiteLead, {
      createId: idFactory()
    })).toThrow("queued, running, or paused");
  });

  it("migrates older saved state by initializing the source activity log", () => {
    const migrated = normalizeExtensionState({
      campaigns: [campaign()],
      activeCampaignId: "campaign-1",
      queueTasks: [],
      leads: [],
      imports: []
    });
    expect(migrated.sourceEvents).toEqual([]);
  });

  it("rejects CSV rows whose declared source is disabled for the campaign", () => {
    const csv = [
      "businessName,websiteUrl,sourceUrl,sourceType",
      "North Gym,https://north.example,https://north.example,business_website"
    ].join("\n");
    const preview = previewCsvImport(seedState({
      sourceConfig: {
        csvImport: true,
        businessWebsites: false,
        metaAdLibrary: false,
        instagram: false
      }
    }), "campaign-1", "source-test.csv", csv, { createId: idFactory() });

    expect(preview.canCommit).toBe(false);
    expect(preview.acceptedRows).toBe(0);
    expect(preview.rejectedRows).toBe(1);
    expect(preview.rows[0]).toMatchObject({ action: "rejected", reason: expect.stringContaining("source type") });
    expect(preview.issues[0].code).toBe("source_not_enabled");
  });
});
