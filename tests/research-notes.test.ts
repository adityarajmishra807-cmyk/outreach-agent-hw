import { describe, expect, it } from "vitest";
import type { Campaign } from "../packages/shared/src/index";
import {
  addManualLead,
  addResearchNote,
  createEmptyExtensionState,
  summarizeLeadResearch,
  normalizeExtensionState
} from "../packages/shared/src/import-workflow";
import type { ResearchNoteInput } from "../packages/shared/src/import-workflow";

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
  const lead = addManualLead(state, "campaign-1", {
    businessName: "North Gym",
    websiteUrl: "https://north.example/services",
    sourceType: "business_website"
  }, { createId: idFactory("lead") });
  return { state: lead.state, leadId: lead.leadId! };
}

function idFactory(prefix = "test") {
  let next = 0;
  return () => prefix + "-" + (++next);
}

const validNote = (leadId: string, overrides: Partial<ResearchNoteInput> = {}): ResearchNoteInput => ({
  leadId,
  category: "services_offered",
  observation: "The services page lists personal training and small-group coaching.",
  evidenceUrl: "https://north.example/services#top",
  potentialOpportunity: "Make the small-group coaching enquiry path easier to find.",
  confidence: "observed",
  ...overrides
});

describe("Phase 3 evidence-first research notes", () => {
  it("saves a factual observation with normalized evidence URL and separate hypothesis", () => {
    const { state, leadId } = seedState();
    const result = addResearchNote(state, "campaign-1", validNote(leadId), {
      now: "2026-10-22T01:00:00.000Z",
      createId: idFactory("note")
    });

    expect(result.created).toBe(true);
    expect(result.note).toMatchObject({
      campaignId: "campaign-1",
      leadId,
      category: "services_offered",
      observation: "The services page lists personal training and small-group coaching.",
      evidenceUrl: "https://north.example/services",
      potentialOpportunity: "Make the small-group coaching enquiry path easier to find.",
      confidence: "observed",
      recordedAt: "2026-10-22T01:00:00.000Z"
    });
    expect(result.state.researchNotes).toEqual([result.note]);
    expect(result.state.leads).toEqual(state.leads);
    expect(result.state.sourceEvents).toEqual(state.sourceEvents);
  });

  it("does not duplicate an identical note but permits a corrected/additional observation", () => {
    const { state, leadId } = seedState();
    const first = addResearchNote(state, "campaign-1", validNote(leadId), {
      createId: idFactory("first")
    });
    const repeated = addResearchNote(first.state, "campaign-1", validNote(leadId), {
      createId: idFactory("repeat")
    });

    expect(repeated.created).toBe(false);
    expect(repeated.note.id).toBe(first.note.id);
    expect(repeated.state.researchNotes).toHaveLength(1);

    const extra = addResearchNote(repeated.state, "campaign-1", validNote(leadId, {
      category: "contact_path",
      observation: "The contact page lists a phone number but no enquiry form."
    }), { createId: idFactory("extra") });
    expect(extra.created).toBe(true);
    expect(extra.state.researchNotes).toHaveLength(2);
  });

  it("requires a lead in the specified campaign", () => {
    const { state, leadId } = seedState();
    expect(() => addResearchNote(state, "missing-campaign", validNote(leadId), {
      createId: idFactory()
    })).toThrow("Campaign not found");

    const otherCampaign = campaign({ id: "campaign-2" });
    const changed = { ...state, campaigns: [...state.campaigns, otherCampaign] };
    expect(() => addResearchNote(changed, "campaign-2", validNote(leadId), {
      createId: idFactory()
    })).toThrow("Choose a lead from the active campaign");
  });

  it("requires a specific observation and valid public HTTP(S) evidence URL", () => {
    const { state, leadId } = seedState();
    expect(() => addResearchNote(state, "campaign-1", validNote(leadId, {
      observation: "Looks good"
    }), { createId: idFactory() })).toThrow("at least 12 characters");

    for (const evidenceUrl of [
      "",
      "north.example/services",
      "javascript:alert(1)",
      "https://user:secret@north.example/services",
      "https://bad url.example"
    ]) {
      expect(() => addResearchNote(state, "campaign-1", validNote(leadId, {
        evidenceUrl
      }), { createId: idFactory() })).toThrow("valid evidence URL");
    }
  });

  it("rejects unknown categories and confidence values", () => {
    const { state, leadId } = seedState();
    expect(() => addResearchNote(state, "campaign-1", validNote(leadId, {
      category: "made_up_category" as ResearchNoteInput["category"]
    }), { createId: idFactory() })).toThrow("supported research category");

    expect(() => addResearchNote(state, "campaign-1", validNote(leadId, {
      confidence: "guaranteed" as ResearchNoteInput["confidence"]
    }), { createId: idFactory() })).toThrow("confidence level");
  });

  it("rejects notes for a terminal campaign without mutating saved history", () => {
    const seeded = seedState();
    const state = {
      ...seeded.state,
      campaigns: seeded.state.campaigns.map((item) => ({ ...item, status: "completed" as const }))
    };
    const snapshot = structuredClone(state);
    expect(() => addResearchNote(state, "campaign-1", validNote(seeded.leadId), {
      createId: idFactory()
    })).toThrow("queued, running, or paused");
    expect(state).toEqual(snapshot);
    expect(state.researchNotes).toEqual([]);
  });

  it("keeps potential opportunity explicitly separate from the observed fact", () => {
    const { state, leadId } = seedState();
    const result = addResearchNote(state, "campaign-1", validNote(leadId, {
      confidence: "needs_verification"
    }), { createId: idFactory() });
    expect(result.note.observation).not.toContain("opportunity");
    expect(result.note.potentialOpportunity).toContain("enquiry path");
    expect(result.note.confidence).toBe("needs_verification");
  });

  it("summarizes evidence coverage and flags verification gaps without assigning a lead score", () => {
    const { state, leadId } = seedState();
    expect(summarizeLeadResearch(state, "campaign-1", leadId)).toMatchObject({
      noteCount: 0,
      directlyObservedCount: 0,
      needsVerificationCount: 0,
      categoriesCovered: [],
      readiness: "not_started"
    });

    const first = addResearchNote(state, "campaign-1", validNote(leadId), {
      createId: idFactory("first")
    });
    expect(summarizeLeadResearch(first.state, "campaign-1", leadId)).toMatchObject({
      noteCount: 1,
      directlyObservedCount: 1,
      needsVerificationCount: 0,
      categoriesCovered: ["services_offered"],
      readiness: "evidence_recorded"
    });

    const second = addResearchNote(first.state, "campaign-1", validNote(leadId, {
      category: "contact_path",
      observation: "The contact page lists a phone number but no enquiry form.",
      evidenceUrl: "https://north.example/contact",
      confidence: "needs_verification"
    }), { createId: idFactory("second") });
    expect(summarizeLeadResearch(second.state, "campaign-1", leadId)).toMatchObject({
      noteCount: 2,
      directlyObservedCount: 1,
      needsVerificationCount: 1,
      categoriesCovered: ["services_offered", "contact_path"],
      readiness: "needs_verification"
    });
  });

  it("initializes research history when migrating Phase 1/2 saved state", () => {
    const migrated = normalizeExtensionState({
      campaigns: [campaign()],
      activeCampaignId: "campaign-1",
      queueTasks: [],
      leads: [],
      imports: [],
      sourceEvents: []
    });
    expect(migrated.researchNotes).toEqual([]);
  });
});
