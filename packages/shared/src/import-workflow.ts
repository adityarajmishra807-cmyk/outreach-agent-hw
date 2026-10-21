import {
  type Campaign,
  type CampaignConfig,
  type QueueTask,
  type LeadStatus
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

export interface ExtensionState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  queueTasks: QueueTask[];
  leads: CanonicalImportedLead[];
  imports: ImportBatch[];
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
  return { campaigns: [], activeCampaignId: null, queueTasks: [], leads: [], imports: [] };
}

/** Migrate the pre-Phase-2 state shape without dropping campaigns or queue tasks. */
export function normalizeExtensionState(raw: unknown): ExtensionState {
  const candidate = raw && typeof raw === "object" ? raw as Partial<ExtensionState> : {};
  return {
    campaigns: Array.isArray(candidate.campaigns) ? candidate.campaigns : [],
    activeCampaignId: typeof candidate.activeCampaignId === "string" ? candidate.activeCampaignId : null,
    queueTasks: Array.isArray(candidate.queueTasks) ? candidate.queueTasks : [],
    leads: Array.isArray(candidate.leads) ? candidate.leads : [],
    imports: Array.isArray(candidate.imports) ? candidate.imports : []
  };
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
