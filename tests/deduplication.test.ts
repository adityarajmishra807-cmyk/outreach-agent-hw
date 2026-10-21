import { describe, expect, it } from "vitest";
import type { CanonicalImportedLead } from "../packages/shared/src/deduplication";
import { deduplicateImportedLeads } from "../packages/shared/src/deduplication";
import { parseLeadCsv } from "../packages/shared/src/csv-import";

function rows(csv: string) {
  const summary = parseLeadCsv(csv);
  expect(summary.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return summary.rows;
}

function idFactory() {
  let current = 0;
  return () => `lead-${++current}`;
}

function dedupe(
  csv: string,
  existingLeads: CanonicalImportedLead[] = [],
  campaignId = "campaign-1"
) {
  return deduplicateImportedLeads(rows(csv), existingLeads, {
    campaignId,
    now: "2026-10-22T00:00:00.000Z",
    createId: idFactory()
  });
}

describe("campaign lead deduplication", () => {
  it("creates canonical leads with source evidence and never marks imported handles verified", () => {
    const result = dedupe(
      "businessName,location,website,instagramUsername,sourceUrl\nNorth Gym,Dehradun,north.example,@northgym,https://directory.example/north"
    );

    expect(result.createdCount).toBe(1);
    expect(result.mergedCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
    expect(result.needsReviewCount).toBe(0);
    expect(result.leads[0]).toMatchObject({
      id: "lead-1",
      campaignId: "campaign-1",
      businessName: "North Gym",
      normalizedName: "north gym",
      websiteDomain: "north.example",
      instagramUsername: "northgym",
      identityStatus: "candidate",
      status: "discovered",
      sourceEvidence: [{
        sourceType: "csv_import",
        sourceUrl: "https://directory.example/north",
        rowNumber: 2
      }]
    });
  });

  it("makes re-importing the exact same record idempotent", () => {
    const csv = "businessName,location,website,instagramUsername,sourceUrl\nNorth Gym,Dehradun,north.example,@northgym,https://directory.example/north";
    const first = dedupe(csv);
    const repeated = dedupe(csv, first.leads);

    expect(repeated.createdCount).toBe(0);
    expect(repeated.mergedCount).toBe(0);
    expect(repeated.duplicateCount).toBe(1);
    expect(repeated.leads).toHaveLength(1);
    expect(repeated.leads[0].sourceEvidence).toHaveLength(1);
    expect(repeated.decisions[0]).toMatchObject({
      rowNumber: 2,
      action: "duplicate",
      canonicalLeadId: first.leads[0].id
    });
  });

  it("merges a new source record by Instagram handle and preserves populated fields", () => {
    const first = dedupe(
      "businessName,location,website,instagramUsername,sourceUrl,notes\nNorth Gym,Dehradun,https://north.example/,@northgym,https://directory.example/a,Strength gym"
    );
    const second = deduplicateImportedLeads(
      rows("businessName,location,website,instagramUsername,sourceUrl,notes\nNorth Gym,Dehradun,https://north.example/services,@northgym,https://directory.example/b,Open late"),
      first.leads,
      { campaignId: "campaign-1", now: "2026-10-22T00:05:00.000Z", createId: idFactory() }
    );

    expect(second.createdCount).toBe(0);
    expect(second.mergedCount).toBe(1);
    expect(second.leads).toHaveLength(1);
    expect(second.leads[0].websiteUrl).toBe("https://north.example/");
    expect(second.leads[0].sourceEvidence).toHaveLength(2);
    expect(second.leads[0].notes).toEqual(["Strength gym", "Open late"]);
    expect(second.leads[0].importFingerprints).toHaveLength(2);
    expect(second.decisions[0]).toMatchObject({
      action: "merged",
      matchKey: "instagram_username",
      canonicalLeadId: first.leads[0].id
    });
  });

  it("matches by website domain when there is no matching Instagram handle", () => {
    const first = dedupe("businessName,website,instagramUsername\nNorth Gym,north.example,northgym");
    const second = deduplicateImportedLeads(
      rows("businessName,website,sourceUrl\nNorth Gym,https://www.north.example/about,https://directory.example/north"),
      first.leads,
      { campaignId: "campaign-1", now: "2026-10-22T00:05:00.000Z", createId: idFactory() }
    );

    expect(second.mergedCount).toBe(1);
    expect(second.leads).toHaveLength(1);
    expect(second.decisions[0].matchKey).toBe("website_domain");
    expect(second.leads[0].sourceEvidence).toHaveLength(2);
  });

  it("flags a matching domain with a conflicting business name for review instead of merging", () => {
    const first = dedupe("businessName,location,website\nNorth Gym,Dehradun,north.example");
    const second = deduplicateImportedLeads(
      rows("businessName,location,website\nNorth Fitness,Dehradun,north.example"),
      first.leads,
      { campaignId: "campaign-1", now: "2026-10-22T00:05:00.000Z", createId: idFactory() }
    );

    expect(second.createdCount).toBe(1);
    expect(second.mergedCount).toBe(0);
    expect(second.needsReviewCount).toBe(1);
    expect(second.leads).toHaveLength(2);
    expect(second.leads[0].businessName).toBe("North Gym");
    expect(second.leads[1]).toMatchObject({
      businessName: "North Fitness",
      status: "duplicate_review",
      identityStatus: "candidate",
      reviewFlags: ["possible_duplicate"]
    });
    expect(second.decisions[0]).toMatchObject({
      action: "needs_review",
      candidateIds: [first.leads[0].id],
      matchKey: "website_domain"
    });
  });

  it("uses exact business name plus location only as the third identity key", () => {
    const first = dedupe("businessName,location,website\nNorth Gym,Dehradun,north.example");
    const same = deduplicateImportedLeads(
      rows("businessName,location,sourceUrl\nNorth Gym,Dehradun,https://directory.example/north"),
      first.leads,
      { campaignId: "campaign-1", now: "2026-10-22T00:05:00.000Z", createId: idFactory() }
    );
    expect(same.mergedCount).toBe(1);
    expect(same.decisions[0].matchKey).toBe("business_name_location");

    const noLocation = dedupe("businessName\nNorth Gym\n", same.leads);
    expect(noLocation.createdCount).toBe(1);
    expect(noLocation.leads).toHaveLength(2);
  });

  it("flags name/location matches that carry conflicting domains or handles", () => {
    const first = dedupe("businessName,location,website,instagramUsername\nNorth Gym,Dehradun,north.example,northgym");
    const second = deduplicateImportedLeads(
      rows("businessName,location,website,instagramUsername\nNorth Gym,Dehradun,northfitness.example,northfitness"),
      first.leads,
      { campaignId: "campaign-1", now: "2026-10-22T00:05:00.000Z", createId: idFactory() }
    );

    expect(second.needsReviewCount).toBe(1);
    expect(second.mergedCount).toBe(0);
    expect(second.decisions[0].action).toBe("needs_review");
  });

  it("does not deduplicate similar business names without a shared strong key or location", () => {
    const csv = "businessName\nNorth Gym\nNorth Gym";
    const result = dedupe(csv);
    expect(result.createdCount).toBe(2);
    expect(result.leads).toHaveLength(2);

    const repeated = deduplicateImportedLeads(rows(csv), result.leads, {
      campaignId: "campaign-1",
      now: "2026-10-22T00:05:00.000Z",
      createId: idFactory()
    });
    expect(repeated.createdCount).toBe(0);
    expect(repeated.duplicateCount).toBe(2);
    expect(repeated.leads).toHaveLength(2);
  });

  it("keeps deduplication scoped to the selected campaign", () => {
    const first = dedupe("businessName,website\nNorth Gym,north.example", [], "campaign-1");
    const second = deduplicateImportedLeads(
      rows("businessName,website\nNorth Gym,north.example"),
      first.leads,
      { campaignId: "campaign-2", now: "2026-10-22T00:05:00.000Z", createId: idFactory() }
    );

    expect(second.createdCount).toBe(1);
    expect(second.leads).toHaveLength(2);
    expect(second.leads.map((lead) => lead.campaignId).sort()).toEqual(["campaign-1", "campaign-2"]);
  });

  it("flags a key shared by multiple canonical leads for manual review", () => {
    const first = dedupe("businessName,instagramUsername\nNorth Gym,northgym");
    const duplicatedExisting = [
      first.leads[0],
      { ...first.leads[0], id: "legacy-duplicate", importFingerprints: ["different-fingerprint"] }
    ];
    const incoming = rows("businessName,instagramUsername,sourceUrl\nNorth Gym,northgym,https://directory.example/second");
    const result = deduplicateImportedLeads(incoming, duplicatedExisting, {
      campaignId: "campaign-1",
      now: "2026-10-22T00:05:00.000Z",
      createId: idFactory()
    });

    expect(result.needsReviewCount).toBe(1);
    expect(result.mergedCount).toBe(0);
    expect(result.decisions[0].action).toBe("needs_review");
    expect(result.decisions[0].candidateIds).toEqual(["lead-1", "legacy-duplicate"]);
  });

  it("rejects a missing campaign ID", () => {
    expect(() => deduplicateImportedLeads([], [], { campaignId: " ", createId: idFactory() }))
      .toThrow("Campaign ID is required.");
  });
});
