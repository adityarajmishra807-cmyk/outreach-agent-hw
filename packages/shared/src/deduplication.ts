import {
  normalizeBusinessName,
  normalizeInstagramUsername,
  normalizeWebsiteDomain,
  type LeadSource,
  type LeadStatus
} from "./index";
import type { ImportLeadRow, LeadSourceProvenance } from "./csv-import";

export type LeadMatchKey = "instagram_username" | "website_domain" | "business_name_location";
export type ImportDecisionAction = "created" | "merged" | "duplicate" | "needs_review";

export interface CanonicalImportedLead {
  id: string;
  campaignId: string;
  businessName: string;
  normalizedName: string;
  location?: string;
  websiteUrl?: string;
  websiteDomain?: string;
  instagramUsername?: string;
  instagramUrl?: string;
  identityStatus: "unmatched" | "candidate" | "verified" | "rejected";
  status: LeadStatus;
  sourceEvidence: LeadSourceProvenance[];
  importFingerprints: string[];
  notes: string[];
  reviewFlags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportRowDecision {
  rowNumber: number;
  action: ImportDecisionAction;
  canonicalLeadId?: string;
  candidateIds?: string[];
  matchKey?: LeadMatchKey;
  reason?: string;
}

export interface DeduplicationResult {
  leads: CanonicalImportedLead[];
  decisions: ImportRowDecision[];
  createdCount: number;
  mergedCount: number;
  duplicateCount: number;
  needsReviewCount: number;
}

export interface DeduplicationOptions {
  campaignId: string;
  now?: string;
  createId: () => string;
}

interface MatchResult {
  key: LeadMatchKey;
  matches: CanonicalImportedLead[];
}

function validInstagramUsername(value?: string, flags: string[] = []): string | undefined {
  if (!value || flags.includes("invalid_instagram_username")) return undefined;
  const normalized = normalizeInstagramUsername(value);
  return /^[a-z0-9._]{1,30}$/i.test(normalized) ? normalized : undefined;
}

function websiteDomain(lead: Pick<CanonicalImportedLead, "websiteDomain" | "websiteUrl">): string | undefined {
  return lead.websiteDomain ?? (lead.websiteUrl ? normalizeWebsiteDomain(lead.websiteUrl) ?? undefined : undefined);
}

function normalizedLocation(value?: string): string {
  return normalizeBusinessName(value ?? "");
}

function sameNonEmpty(left?: string, right?: string): boolean {
  return Boolean(left && right && left === right);
}

function findStrongestMatch(
  leads: CanonicalImportedLead[],
  campaignId: string,
  incoming: ImportLeadRow
): MatchResult | undefined {
  const scoped = leads.filter((lead) => lead.campaignId === campaignId);

  const incomingHandle = validInstagramUsername(incoming.instagramUsername, incoming.reviewFlags);
  if (incomingHandle) {
    const matches = scoped.filter((lead) =>
      validInstagramUsername(lead.instagramUsername, lead.reviewFlags) === incomingHandle
    );
    if (matches.length) return { key: "instagram_username", matches };
  }

  const incomingDomain = incoming.websiteDomain ?? (incoming.websiteUrl ? normalizeWebsiteDomain(incoming.websiteUrl) ?? undefined : undefined);
  if (incomingDomain) {
    const matches = scoped.filter((lead) => websiteDomain(lead) === incomingDomain);
    if (matches.length) return { key: "website_domain", matches };
  }

  const incomingLocation = normalizedLocation(incoming.location);
  if (incoming.normalizedName && incomingLocation) {
    const matches = scoped.filter((lead) =>
      lead.normalizedName === incoming.normalizedName &&
      sameNonEmpty(normalizedLocation(lead.location), incomingLocation)
    );
    if (matches.length) return { key: "business_name_location", matches };
  }

  return undefined;
}

function hasIdentityConflict(existing: CanonicalImportedLead, incoming: ImportLeadRow): boolean {
  const existingName = existing.normalizedName || normalizeBusinessName(existing.businessName);
  if (existingName && incoming.normalizedName && existingName !== incoming.normalizedName) return true;

  const existingLocation = normalizedLocation(existing.location);
  const incomingLocation = normalizedLocation(incoming.location);
  if (existingLocation && incomingLocation && existingLocation !== incomingLocation) return true;

  const oldHandle = validInstagramUsername(existing.instagramUsername, existing.reviewFlags);
  const newHandle = validInstagramUsername(incoming.instagramUsername, incoming.reviewFlags);
  if (oldHandle && newHandle && oldHandle !== newHandle) return true;

  const oldDomain = websiteDomain(existing);
  const newDomain = incoming.websiteDomain ?? (incoming.websiteUrl ? normalizeWebsiteDomain(incoming.websiteUrl) ?? undefined : undefined);
  if (oldDomain && newDomain && oldDomain !== newDomain) return true;

  return false;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ""))];
}

function cloneLead(lead: CanonicalImportedLead): CanonicalImportedLead {
  return {
    ...lead,
    sourceEvidence: [...lead.sourceEvidence],
    importFingerprints: [...lead.importFingerprints],
    notes: [...lead.notes],
    reviewFlags: [...lead.reviewFlags]
  };
}

function newCanonicalLead(
  row: ImportLeadRow,
  campaignId: string,
  id: string,
  now: string,
  needsReview = false,
  candidateIds: string[] = []
): CanonicalImportedLead {
  const reviewFlags = unique([
    ...row.reviewFlags,
    ...(needsReview ? ["possible_duplicate"] : [])
  ]);
  return {
    id,
    campaignId,
    businessName: row.businessName,
    normalizedName: row.normalizedName,
    location: row.location,
    websiteUrl: row.websiteUrl,
    websiteDomain: row.websiteDomain,
    instagramUsername: row.instagramUsername,
    instagramUrl: row.instagramUrl,
    identityStatus: needsReview ? "candidate" : (validInstagramUsername(row.instagramUsername, row.reviewFlags) ? "candidate" : "unmatched"),
    status: needsReview ? "duplicate_review" : (row.reviewFlags.includes("invalid_instagram_username") ? "identity_review" : "discovered"),
    sourceEvidence: [{ ...row.provenance }],
    importFingerprints: [row.importFingerprint],
    notes: row.notes ? [row.notes] : [],
    reviewFlags,
    createdAt: now,
    updatedAt: now
  };
}

function mergeIntoCanonical(
  existing: CanonicalImportedLead,
  row: ImportLeadRow,
  now: string
): CanonicalImportedLead {
  const sameFingerprint = existing.importFingerprints.includes(row.importFingerprint);
  const sourceEvidence = sameFingerprint ||
      existing.sourceEvidence.some((source) => source.importFingerprint === row.importFingerprint)
    ? existing.sourceEvidence
    : [...existing.sourceEvidence, { ...row.provenance }];

  return {
    ...existing,
    // Only enrich absent fields. Existing verified/user-corrected data wins.
    location: existing.location || row.location,
    websiteUrl: existing.websiteUrl || row.websiteUrl,
    websiteDomain: websiteDomain(existing) || row.websiteDomain,
    instagramUsername: existing.instagramUsername || row.instagramUsername,
    instagramUrl: existing.instagramUrl || row.instagramUrl,
    sourceEvidence,
    importFingerprints: sameFingerprint
      ? existing.importFingerprints
      : unique([...existing.importFingerprints, row.importFingerprint]),
    notes: unique([...existing.notes, ...(row.notes ? [row.notes] : [])]),
    reviewFlags: unique([...existing.reviewFlags, ...row.reviewFlags]),
    updatedAt: now
  };
}

/**
 * Deduplicates imported rows within a campaign while preserving source evidence.
 * Exact fingerprints are idempotent; ambiguous/conflicting identities are kept
 * as separate review records instead of destructively merged.
 */
export function deduplicateImportedLeads(
  incomingRows: ImportLeadRow[],
  existingLeads: CanonicalImportedLead[],
  options: DeduplicationOptions
): DeduplicationResult {
  if (!options.campaignId.trim()) throw new Error("Campaign ID is required.");
  if (typeof options.createId !== "function") throw new Error("An ID generator is required.");

  const now = options.now ?? new Date().toISOString();
  const leads = existingLeads.map(cloneLead);
  const decisions: ImportRowDecision[] = [];
  let createdCount = 0;
  let mergedCount = 0;
  let duplicateCount = 0;
  let needsReviewCount = 0;

  for (const row of incomingRows) {
    const scoped = leads.filter((lead) => lead.campaignId === options.campaignId);
    const exactFingerprintMatches = scoped.filter((lead) =>
      lead.importFingerprints.includes(row.importFingerprint) ||
      lead.sourceEvidence.some((source) => source.importFingerprint === row.importFingerprint)
    );

    if (exactFingerprintMatches.length === 1) {
      duplicateCount += 1;
      decisions.push({
        rowNumber: row.rowNumber,
        action: "duplicate",
        canonicalLeadId: exactFingerprintMatches[0].id,
        reason: "This exact imported record was already processed; no duplicate source evidence was added."
      });
      continue;
    }
    if (exactFingerprintMatches.length > 1) {
      needsReviewCount += 1;
      decisions.push({
        rowNumber: row.rowNumber,
        action: "needs_review",
        candidateIds: exactFingerprintMatches.map((lead) => lead.id),
        reason: "The exact import fingerprint already exists on multiple canonical leads."
      });
      continue;
    }

    const match = findStrongestMatch(leads, options.campaignId, row);
    if (!match) {
      const created = newCanonicalLead(row, options.campaignId, options.createId(), now);
      leads.push(created);
      createdCount += 1;
      decisions.push({
        rowNumber: row.rowNumber,
        action: "created",
        canonicalLeadId: created.id
      });
      continue;
    }

    if (match.matches.length !== 1 || hasIdentityConflict(match.matches[0], row)) {
      const candidates = match.matches;
      const reviewLead = newCanonicalLead(
        row,
        options.campaignId,
        options.createId(),
        now,
        true,
        candidates.map((lead) => lead.id)
      );
      leads.push(reviewLead);
      createdCount += 1;
      needsReviewCount += 1;
      decisions.push({
        rowNumber: row.rowNumber,
        action: "needs_review",
        canonicalLeadId: reviewLead.id,
        candidateIds: candidates.map((lead) => lead.id),
        matchKey: match.key,
        reason: candidates.length !== 1
          ? "More than one lead shares the strongest identity key."
          : "A strong identity key matched, but other identity fields conflict."
      });
      continue;
    }

    const matchedLead = match.matches[0];
    const updatedLead = mergeIntoCanonical(matchedLead, row, now);
    const position = leads.findIndex((lead) => lead.id === matchedLead.id);
    leads[position] = updatedLead;
    mergedCount += 1;
    decisions.push({
      rowNumber: row.rowNumber,
      action: "merged",
      canonicalLeadId: matchedLead.id,
      matchKey: match.key,
      reason: "Matched one canonical lead; preserved existing populated fields and added new source evidence."
    });
  }

  return { leads, decisions, createdCount, mergedCount, duplicateCount, needsReviewCount };
}

/** Source type guard exported for downstream import/persistence code. */
export function isLeadSource(value: string): value is LeadSource {
  return [
    "meta_ad_library_manual",
    "instagram_manual",
    "business_website",
    "google_maps_manual",
    "csv_import",
    "other_permitted_source"
  ].includes(value);
}
