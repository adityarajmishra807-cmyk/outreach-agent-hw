import {
  type Campaign,
  type CampaignConfig,
  type QueueTask,
  type LeadStatus,
  type LeadSource
} from "./index";
import {
  deduplicateImportedLeads,
  type CanonicalImportedLead,
  type ImportDecisionAction
} from "./deduplication";
import {
  parseLeadCsv,
  stringifyImportExceptions,
  type ImportExceptionExportRow,
  type ImportIssue
} from "./csv-import";

export interface ImportBatch {
  id: string;
  campaignId: string;
  fileName: string;
  importedAt: string;
  parsedRows: number;
  rejectedRows: number;
  warningCount: number;
  createdCount: number;
  mergedCount: number;
  duplicateCount: number;
  needsReviewCount: number;
  overCapacityCount: number;
}

export interface ImportPreviewRow {
  rowNumber: number;
  businessName: string;
  action: ImportDecisionAction | "over_capacity" | "rejected";
  reason?: string;
  candidateIds?: string[];
  reviewFlags?: string[];
}

export interface ImportPreview {
  campaignId: string;
  fileName: string;
  canCommit: boolean;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  warningCount: number;
  createdCount: number;
  mergedCount: number;
  duplicateCount: number;
  needsReviewCount: number;
  overCapacityCount: number;
  currentLeadCount: number;
  finalLeadCount: number;
  targetCount: number;
  issues: ImportIssue[];
  rows: ImportPreviewRow[];
}

export type ManualSourceAction = ImportDecisionAction | "over_capacity";

export interface ManualLeadInput {
  businessName: string;
  location?: string;
  websiteUrl?: string;
  instagramUsername?: string;
  instagramUrl?: string;
  sourceUrl?: string;
  sourceType: LeadSource;
  notes?: string;
}

export interface SourceIntakeEvent {
  id: string;
  campaignId: string;
  occurredAt: string;
  sourceType: LeadSource;
  businessName: string;
  sourceUrl?: string;
  action: ManualSourceAction;
  leadId?: string;
  candidateIds?: string[];
  reviewFlags: string[];
  reason?: string;
}

export interface AddManualLeadResult {
  state: ExtensionState;
  action: ManualSourceAction;
  businessName: string;
  leadId?: string;
  candidateIds?: string[];
  reason?: string;
  leadCount: number;
  reviewFlags: string[];
}

export interface ExtensionState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  queueTasks: QueueTask[];
  leads: CanonicalImportedLead[];
  imports: ImportBatch[];
  sourceEvents: SourceIntakeEvent[];
}

export interface PreparedCsvImport {
  preview: ImportPreview;
  finalLeads: CanonicalImportedLead[];
  exportExceptions: ImportExceptionExportRow[];
}

export interface CsvImportOptions {
  now?: string;
  createId: () => string;
}

export interface CsvCommitResult {
  state: ExtensionState;
  importResult: ImportPreview;
}

export function createEmptyExtensionState(): ExtensionState {
  return {
    campaigns: [],
    activeCampaignId: null,
    queueTasks: [],
    leads: [],
    imports: [],
    sourceEvents: []
  };
}

/** Migrate the pre-Phase-2 state shape without dropping campaigns or queue tasks. */
export function normalizeExtensionState(raw: unknown): ExtensionState {
  const candidate = raw && typeof raw === "object" ? raw as Partial<ExtensionState> : {};
  return {
    campaigns: Array.isArray(candidate.campaigns) ? candidate.campaigns : [],
    activeCampaignId: typeof candidate.activeCampaignId === "string" ? candidate.activeCampaignId : null,
    queueTasks: Array.isArray(candidate.queueTasks) ? candidate.queueTasks : [],
    leads: Array.isArray(candidate.leads) ? candidate.leads : [],
    imports: Array.isArray(candidate.imports) ? candidate.imports : [],
    sourceEvents: Array.isArray(candidate.sourceEvents) ? candidate.sourceEvents : []
  };
}

const MANUAL_FIELD_LIMITS: Record<string, number> = {
  businessName: 150,
  location: 160,
  websiteUrl: 2048,
  instagramUsername: 100,
  instagramUrl: 2048,
  sourceUrl: 2048,
  notes: 2000
};

function manualSourceEnabled(campaign: Campaign, sourceType: LeadSource): boolean {
  switch (sourceType) {
    case "meta_ad_library_manual":
      return campaign.sourceConfig.metaAdLibrary;
    case "instagram_manual":
      return campaign.sourceConfig.instagram;
    case "business_website":
      return campaign.sourceConfig.businessWebsites;
    case "google_maps_manual":
    case "csv_import":
    case "other_permitted_source":
      return campaign.sourceConfig.csvImport;
    default:
      return false;
  }
}

function getManualLeadCampaign(state: ExtensionState, campaignId: string, sourceType: LeadSource): Campaign {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (!["queued", "running", "paused"].includes(campaign.status)) {
    throw new Error("Manual source intake is available only while the campaign is queued, running, or paused.");
  }
  if (!manualSourceEnabled(campaign, sourceType)) {
    throw new Error("This source is disabled for the campaign. Enable its source setting before adding this record.");
  }
  return campaign;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

function parseManualLead(input: ManualLeadInput): ReturnType<typeof parseLeadCsv>["rows"][number] {
  if (!input || typeof input !== "object" || typeof input.businessName !== "string") {
    throw new Error("Business name is required.");
  }
  const sourceTypes: LeadSource[] = [
    "meta_ad_library_manual",
    "instagram_manual",
    "business_website",
    "google_maps_manual",
    "csv_import",
    "other_permitted_source"
  ];
  if (!sourceTypes.includes(input.sourceType)) throw new Error("Choose a supported, user-provided source type.");

  const values: Record<string, string> = {
    businessName: input.businessName,
    location: input.location ?? "",
    websiteUrl: input.websiteUrl ?? "",
    instagramUsername: input.instagramUsername ?? "",
    instagramUrl: input.instagramUrl ?? "",
    sourceUrl: input.sourceUrl ?? "",
    sourceType: input.sourceType,
    notes: input.notes ?? ""
  };
  for (const [field, maxLength] of Object.entries(MANUAL_FIELD_LIMITS)) {
    const value = values[field] ?? "";
    if (typeof value !== "string") throw new Error(field + " must be text.");
    if (value.length > maxLength) throw new Error(field + " exceeds the " + maxLength + "-character limit.");
    values[field] = value.trim();
  }
  if (!values.businessName) throw new Error("Business name is required.");

  if (input.sourceType === "meta_ad_library_manual" && !values.sourceUrl) {
    throw new Error("Add the Meta Ad Library URL you reviewed as source evidence.");
  }
  if (input.sourceType === "instagram_manual" && !values.sourceUrl && !values.instagramUrl) {
    throw new Error("Add the Instagram profile URL as source evidence.");
  }
  if (input.sourceType === "business_website" && !values.sourceUrl && !values.websiteUrl) {
    throw new Error("Add the business website URL as source evidence.");
  }

  const headers = Object.keys(values);
  const csvText = [
    headers.map(csvCell).join(","),
    headers.map((header) => csvCell(values[header])).join(",")
  ].join("\r\n");
  const parsed = parseLeadCsv(csvText);
  const row = parsed.rows[0];
  if (!row || parsed.rejectedRows.length) {
    const reason = parsed.rejectedRows.flatMap((item) => item.issues).map((issue) => issue.message).join(" ");
    throw new Error(reason || parsed.issues[0]?.message || "The manual lead entry could not be validated.");
  }
  return row;
}

/**
 * Accepts one user-researched business record. This performs no network request
 * or browser extraction. Source settings are enforced, fields are parsed with
 * the CSV contract, and exact/ambiguous identity matches use the shared policy.
 */
export function addManualLead(
  state: ExtensionState,
  campaignId: string,
  input: ManualLeadInput,
  options: CsvImportOptions
): AddManualLeadResult {
  const sourceType = input?.sourceType;
  const sourceTypes: LeadSource[] = [
    "meta_ad_library_manual",
    "instagram_manual",
    "business_website",
    "google_maps_manual",
    "csv_import",
    "other_permitted_source"
  ];
  if (!sourceTypes.includes(sourceType)) throw new Error("Choose a supported, user-provided source type.");
  const campaign = getManualLeadCampaign(state, campaignId, sourceType);
  const row = parseManualLead(input);
  const now = options.now ?? new Date().toISOString();
  const attempt = deduplicateImportedLeads([row], state.leads, {
    campaignId,
    now,
    createId: options.createId,
    maxLeads: campaign.targetCount
  });
  const decision = attempt.decisions[0];
  const reason = decision.reason;
  const event: SourceIntakeEvent = {
    id: options.createId(),
    campaignId,
    occurredAt: now,
    sourceType,
    businessName: row.businessName,
    sourceUrl: row.sourceUrl,
    action: decision.action,
    leadId: decision.canonicalLeadId,
    candidateIds: decision.candidateIds,
    reviewFlags: [...row.reviewFlags],
    reason
  };
  const nextState: ExtensionState = {
    ...state,
    leads: attempt.leads,
    sourceEvents: [event, ...(state.sourceEvents ?? [])].slice(0, 500)
  };
  return {
    state: nextState,
    action: decision.action,
    businessName: row.businessName,
    leadId: decision.canonicalLeadId,
    candidateIds: decision.candidateIds,
    reason,
    leadCount: countCampaignLeads(attempt.leads, campaignId),
    reviewFlags: [...row.reviewFlags]
  };
}

function sourceTypeEnabledForCsv(campaign: Campaign, sourceType: LeadSource): boolean {
  return manualSourceEnabled(campaign, sourceType);
}

function countCampaignLeads(leads: CanonicalImportedLead[], campaignId: string): number {
  return leads.filter((lead) => lead.campaignId === campaignId).length;
}

function getImportableCampaign(state: ExtensionState, campaignId: string): Campaign {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (!["queued", "running", "paused"].includes(campaign.status)) {
    throw new Error("Import is available only while the campaign is queued, running, or paused.");
  }
  if (!campaign.sourceConfig.csvImport) {
    throw new Error("CSV / manual import was not enabled in this campaign's source settings.");
  }
  return campaign;
}

export function prepareCsvImport(
  state: ExtensionState,
  campaignId: string,
  fileName: string,
  csvText: string,
  options: CsvImportOptions
): PreparedCsvImport {
  const campaign = getImportableCampaign(state, campaignId);
  const safeFileName = (fileName.trim() || "leads.csv").slice(0, 128);
  const parsed = parseLeadCsv(csvText);
  const currentLeadCount = countCampaignLeads(state.leads, campaignId);
  let workingLeads = state.leads;
  let createdCount = 0;
  let mergedCount = 0;
  let duplicateCount = 0;
  let needsReviewCount = 0;
  let overCapacityCount = 0;
  const issues: ImportIssue[] = [...parsed.issues];
  const rows: ImportPreviewRow[] = [];
  const exportExceptions: ImportExceptionExportRow[] = [];

  for (const row of parsed.rows) {
    const beforeCount = countCampaignLeads(workingLeads, campaignId);
    const attempt = deduplicateImportedLeads([row], workingLeads, {
      campaignId,
      now: options.now,
      createId: options.createId,
      maxLeads: campaign.targetCount
    });
    const decision = attempt.decisions[0];

    if (decision.action === "over_capacity") {
      overCapacityCount += 1;
      const reason = `Row ${row.rowNumber} was not imported because the campaign target of ${campaign.targetCount} leads is full.`;
      issues.push({
        code: "campaign_capacity_exceeded",
        message: reason,
        severity: "warning",
        rowNumber: row.rowNumber
      });
      exportExceptions.push({
        rowNumber: row.rowNumber,
        rawFields: row.rawFields,
        status: "over_capacity",
        reason
      });
      rows.push({
        rowNumber: row.rowNumber,
        businessName: row.businessName,
        action: "over_capacity",
        reason: decision.reason,
        reviewFlags: row.reviewFlags
      });
      continue;
    }

    workingLeads = attempt.leads;
    switch (decision.action) {
      case "created":
        createdCount += 1;
        break;
      case "merged":
        mergedCount += 1;
        break;
      case "duplicate":
        duplicateCount += 1;
        break;
      case "needs_review":
        needsReviewCount += 1;
        break;
    }
    rows.push({
      rowNumber: row.rowNumber,
      businessName: row.businessName,
      action: decision.action,
      reason: decision.reason,
      reviewFlags: row.reviewFlags
    });
    if (countCampaignLeads(workingLeads, campaignId) - beforeCount > 1) {
      throw new Error("Import would exceed the one-row queue invariant.");
    }
  }

  for (const rejected of parsed.rejectedRows) {
    const nameField = Object.entries(rejected.rawFields)
      .find(([header]) => /business[\s_-]*name|^business$|^name$/i.test(header));
    const reason = rejected.issues.map((issue) => issue.message).join(" ");
    exportExceptions.push({
      rowNumber: rejected.rowNumber,
      rawFields: rejected.rawFields,
      status: "rejected",
      reason
    });
    rows.push({
      rowNumber: rejected.rowNumber,
      businessName: nameField?.[1] || "(missing business name)",
      action: "rejected",
      reason
    });
  }
  rows.sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    preview: {
      campaignId,
      fileName: safeFileName,
      canCommit: createdCount + mergedCount + duplicateCount + needsReviewCount > 0,
      totalRows: parsed.totalRows,
      acceptedRows: parsed.acceptedCount,
      rejectedRows: parsed.rejectedCount,
      warningCount: issues.filter((issue) => issue.severity === "warning").length,
      createdCount,
      mergedCount,
      duplicateCount,
      needsReviewCount,
      overCapacityCount,
      currentLeadCount,
      finalLeadCount: countCampaignLeads(workingLeads, campaignId),
      targetCount: campaign.targetCount,
      issues: issues.slice(0, 100),
      rows: rows.slice(0, 100)
    },
    finalLeads: workingLeads,
    exportExceptions
  };
}

export function previewCsvImport(
  state: ExtensionState,
  campaignId: string,
  fileName: string,
  csvText: string,
  options: CsvImportOptions
): ImportPreview {
  return prepareCsvImport(state, campaignId, fileName, csvText, options).preview;
}

export function exportCsvExceptions(
  state: ExtensionState,
  campaignId: string,
  fileName: string,
  csvText: string,
  options: CsvImportOptions
): { fileName: string; csvText: string; exceptionCount: number } {
  const prepared = prepareCsvImport(state, campaignId, fileName, csvText, options);
  const baseName = prepared.preview.fileName
    .replace(/\.csv$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .slice(0, 100) || "leads";
  return {
    fileName: `${baseName}-exceptions.csv`,
    csvText: stringifyImportExceptions(prepared.exportExceptions),
    exceptionCount: prepared.exportExceptions.length
  };
}

export function buildCsvImportCommit(
  state: ExtensionState,
  campaignId: string,
  fileName: string,
  csvText: string,
  options: CsvImportOptions
): CsvCommitResult {
  const now = options.now ?? new Date().toISOString();
  const prepared = prepareCsvImport(state, campaignId, fileName, csvText, { ...options, now });
  if (!prepared.preview.canCommit) throw new Error("The CSV contains no valid business rows to import.");

  const batch: ImportBatch = {
    id: options.createId(),
    campaignId,
    fileName: prepared.preview.fileName,
    importedAt: now,
    parsedRows: prepared.preview.totalRows,
    rejectedRows: prepared.preview.rejectedRows,
    warningCount: prepared.preview.warningCount,
    createdCount: prepared.preview.createdCount,
    mergedCount: prepared.preview.mergedCount,
    duplicateCount: prepared.preview.duplicateCount,
    needsReviewCount: prepared.preview.needsReviewCount,
    overCapacityCount: prepared.preview.overCapacityCount
  };
  const nextState: ExtensionState = {
    ...state,
    leads: prepared.finalLeads,
    imports: [batch, ...state.imports].slice(0, 100)
  };
  return {
    state: nextState,
    importResult: prepared.preview
  };
}
