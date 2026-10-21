import {
  canTransitionCampaign,
  canTransitionQueueTask,
  cancelPendingQueueTasks,
  countQueueTasks,
  enqueueQueueTask,
  type Campaign,
  type CampaignConfig,
  type QueueTask,
  type QueueTaskStatus,
  reconcileInterruptedQueueTasks,
  transitionCampaign,
  transitionQueueTask,
  validateCampaignConfig
} from "@horizon/shared";
import { deduplicateImportedLeads, type CanonicalImportedLead, type ImportDecisionAction } from "@horizon/shared/deduplication";
import { parseLeadCsv, type ImportIssue } from "@horizon/shared/csv-import";

const STORAGE_KEY = "horizon-outreach-state-v1";

interface ImportBatch {
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

interface ImportPreviewRow {
  rowNumber: number;
  businessName: string;
  action: ImportDecisionAction | "over_capacity" | "rejected";
  reason?: string;
  reviewFlags?: string[];
}

interface ImportPreview {
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

interface PreparedCsvImport {
  preview: ImportPreview;
  finalLeads: CanonicalImportedLead[];
}

interface ExtensionState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  queueTasks: QueueTask[];
  leads: CanonicalImportedLead[];
  imports: ImportBatch[];
}

type ExtensionMessage =
  | { type: "GET_STATE" }
  | { type: "CREATE_CAMPAIGN"; config: CampaignConfig }
  | { type: "PAUSE_CAMPAIGN"; campaignId: string }
  | { type: "RESUME_CAMPAIGN"; campaignId: string }
  | { type: "STOP_CAMPAIGN"; campaignId: string }
  | { type: "ENQUEUE_TASK"; taskId: string; campaignId: string; leadId: string }
  | { type: "TRANSITION_TASK"; taskId: string; nextStatus: QueueTaskStatus; error?: string }
  | { type: "GET_QUEUE_COUNTS"; campaignId: string }
  | { type: "PREVIEW_CSV_IMPORT"; campaignId: string; fileName: string; csvText: string }
  | { type: "COMMIT_CSV_IMPORT"; campaignId: string; fileName: string; csvText: string };

const EMPTY_STATE: ExtensionState = {
  campaigns: [],
  activeCampaignId: null,
  queueTasks: [],
  leads: [],
  imports: []
};

// Serialize state-changing messages so concurrent popup/side-panel requests do not overwrite each other.
let stateMutationTail: Promise<void> = Promise.resolve();

function serializeStateMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = stateMutationTail.then(operation, operation);
  stateMutationTail = result.then(() => undefined, () => undefined);
  return result;
}

async function loadState(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY] as Partial<ExtensionState> | undefined;
  return {
    campaigns: raw?.campaigns ?? [],
    activeCampaignId: raw?.activeCampaignId ?? null,
    queueTasks: raw?.queueTasks ?? [],
    leads: raw?.leads ?? [],
    imports: raw?.imports ?? []
  };
}

async function saveState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

// Runs once per service-worker activation. Interrupted work is flagged for review;
// it is never automatically replayed when its last state is uncertain.
let recoveryPromise: Promise<void> | null = null;

async function ensureRecovered(): Promise<void> {
  if (!recoveryPromise) {
    recoveryPromise = (async () => {
      const current = await loadState();
      const queueTasks = reconcileInterruptedQueueTasks(current.queueTasks);
      const hasInterruptedTasks = queueTasks.some((task, index) =>
        task.status !== current.queueTasks[index]?.status
      );
      if (hasInterruptedTasks) await saveState({ ...current, queueTasks });
    })();
  }
  await recoveryPromise;
}

function makeId(): string {
  return crypto.randomUUID();
}

async function createCampaign(config: CampaignConfig): Promise<ExtensionState> {
  await ensureRecovered();
  const errors = validateCampaignConfig(config);
  if (errors.length) throw new Error(errors.join(" "));
  const current = await loadState();
  const now = new Date().toISOString();
  const campaign: Campaign = {
    ...config,
    id: makeId(),
    status: "queued",
    createdAt: now,
    updatedAt: now
  };
  const next = { ...current, campaigns: [campaign, ...current.campaigns], activeCampaignId: campaign.id };
  await saveState(next);
  return next;
}

async function transitionActiveCampaign(
  campaignId: string,
  nextStatus: Campaign["status"]
): Promise<ExtensionState> {
  await ensureRecovered();
  const current = await loadState();
  const target = current.campaigns.find((campaign) => campaign.id === campaignId);
  if (!target) throw new Error("Campaign not found.");
  if (!canTransitionCampaign(target.status, nextStatus)) {
    throw new Error(`Cannot change campaign from ${target.status} to ${nextStatus}.`);
  }
  const updated: Campaign = {
    ...transitionCampaign(target, nextStatus),
    updatedAt: new Date().toISOString()
  };
  // On cancellation, pending work is skipped so it cannot accidentally resume.
  const queueTasks = nextStatus === "cancelled"
    ? cancelPendingQueueTasks(current.queueTasks, campaignId)
    : current.queueTasks;
  const next = {
    ...current,
    campaigns: current.campaigns.map((campaign) => campaign.id === campaignId ? updated : campaign),
    activeCampaignId: current.activeCampaignId,
    queueTasks
  };
  await saveState(next);
  return next;
}

async function enqueueTask(input: { taskId: string; campaignId: string; leadId: string }): Promise<ExtensionState> {
  await ensureRecovered();
  const current = await loadState();
  const campaign = current.campaigns.find((item) => item.id === input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  if (!["queued", "running", "paused"].includes(campaign.status)) {
    throw new Error("Tasks cannot be added to a completed, cancelled, or failed campaign.");
  }
  const result = enqueueQueueTask(
    current.queueTasks,
    { id: input.taskId, campaignId: input.campaignId, leadId: input.leadId },
    campaign.targetCount
  );
  if (!result.created) return current;
  const next = { ...current, queueTasks: result.tasks };
  await saveState(next);
  return next;
}

async function updateTask(input: { taskId: string; nextStatus: QueueTaskStatus; error?: string }): Promise<ExtensionState> {
  await ensureRecovered();
  const current = await loadState();
  const task = current.queueTasks.find((item) => item.id === input.taskId);
  if (!task) throw new Error("Queue task not found.");
  const campaign = current.campaigns.find((item) => item.id === task.campaignId);
  if (!campaign) throw new Error("Queue task campaign not found.");
  if (input.nextStatus === "processing" && campaign.status !== "running") {
    throw new Error("Start or resume the campaign before processing queue tasks.");
  }
  if (!canTransitionQueueTask(task.status, input.nextStatus)) {
    throw new Error(`Cannot change task from ${task.status} to ${input.nextStatus}.`);
  }
  const updated = transitionQueueTask(task, input.nextStatus, { error: input.error });
  const next = {
    ...current,
    queueTasks: current.queueTasks.map((item) => item.id === input.taskId ? updated : item)
  };
  await saveState(next);
  return next;
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

function prepareCsvImport(
  state: ExtensionState,
  campaignId: string,
  fileName: string,
  csvText: string
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

  for (const row of parsed.rows) {
    const beforeCount = countCampaignLeads(workingLeads, campaignId);
    const attempt = deduplicateImportedLeads([row], workingLeads, {
      campaignId,
      now: new Date().toISOString(),
      createId: makeId,
      maxLeads: campaign.targetCount
    });
    const decision = attempt.decisions[0];

    if (decision.action === "over_capacity") {
      overCapacityCount += 1;
      issues.push({
        code: "campaign_capacity_exceeded",
        message: `Row ${row.rowNumber} was not imported because the campaign target of ${campaign.targetCount} leads is full.`,
        severity: "warning",
        rowNumber: row.rowNumber
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
      case "over_capacity":
        // Handled above, but kept exhaustive for future decision actions.
        break;
    }
    rows.push({
      rowNumber: row.rowNumber,
      businessName: row.businessName,
      action: decision.action,
      reason: decision.reason,
      reviewFlags: row.reviewFlags
    });
    // Defensive assertion: a single incoming row must never increase the count by more than one.
    if (countCampaignLeads(workingLeads, campaignId) - beforeCount > 1) {
      throw new Error("Import would exceed the one-row queue invariant.");
    }
  }

  for (const rejected of parsed.rejectedRows) {
    const nameField = Object.entries(rejected.rawFields)
      .find(([header]) => /business[\\s_-]*name|^business$|^name$/i.test(header));
    rows.push({
      rowNumber: rejected.rowNumber,
      businessName: nameField?.[1] || "(missing business name)",
      action: "rejected",
      reason: rejected.issues.map((issue) => issue.message).join(" ")
    });
  }
  rows.sort((left, right) => left.rowNumber - right.rowNumber);

  return {
    preview: {
      campaignId,
      fileName: safeFileName,
      canCommit: parsed.acceptedCount > 0,
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
    finalLeads: workingLeads
  };
}

async function previewCsvImport(
  campaignId: string,
  fileName: string,
  csvText: string
): Promise<ImportPreview> {
  const state = await loadState();
  return prepareCsvImport(state, campaignId, fileName, csvText).preview;
}

async function commitCsvImport(
  campaignId: string,
  fileName: string,
  csvText: string
): Promise<{ state: ExtensionState; importResult: ImportPreview }> {
  await ensureRecovered();
  const state = await loadState();
  const prepared = prepareCsvImport(state, campaignId, fileName, csvText);
  if (!prepared.preview.canCommit) throw new Error("The CSV contains no valid business rows to import.");

  const now = new Date().toISOString();
  const batch: ImportBatch = {
    id: makeId(),
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
  const next: ExtensionState = {
    ...state,
    leads: prepared.finalLeads,
    imports: [batch, ...state.imports].slice(0, 100)
  };
  await saveState(next);
  return { state: next, importResult: prepared.preview };
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  const run = async (): Promise<Record<string, unknown>> => {
    switch (message.type) {
      case "GET_STATE":
        await ensureRecovered();
        return { ok: true, state: await loadState() };
      case "CREATE_CAMPAIGN":
        return { ok: true, state: await serializeStateMutation(() => createCampaign(message.config)) };
      case "PAUSE_CAMPAIGN":
        return { ok: true, state: await serializeStateMutation(() => transitionActiveCampaign(message.campaignId, "paused")) };
      case "RESUME_CAMPAIGN":
        return { ok: true, state: await serializeStateMutation(() => transitionActiveCampaign(message.campaignId, "running")) };
      case "STOP_CAMPAIGN":
        return { ok: true, state: await serializeStateMutation(() => transitionActiveCampaign(message.campaignId, "cancelled")) };
      case "ENQUEUE_TASK":
        return { ok: true, state: await serializeStateMutation(() => enqueueTask(message)) };
      case "TRANSITION_TASK":
        return { ok: true, state: await serializeStateMutation(() => updateTask(message)) };
      case "GET_QUEUE_COUNTS": {
        await ensureRecovered();
        const state = await loadState();
        if (!state.campaigns.some((campaign) => campaign.id === message.campaignId)) throw new Error("Campaign not found.");
        return { ok: true, counts: countQueueTasks(state.queueTasks, message.campaignId) };
      }
      case "PREVIEW_CSV_IMPORT":
        return { ok: true, preview: await previewCsvImport(message.campaignId, message.fileName, message.csvText) };
      case "COMMIT_CSV_IMPORT": {
        const committed = await serializeStateMutation(() =>
          commitCsvImport(message.campaignId, message.fileName, message.csvText)
        );
        return { ok: true, state: committed.state, importResult: committed.importResult };
      }
    }
  };

  void run()
    .then(sendResponse)
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected extension error."
    }));
  return true;
});

// Keep the recovery policy available for the browser worker's future execution loop.
// Nothing is automatically re-run if a previous task was interrupted.
export async function reconcileStoredQueueAfterRestart(): Promise<void> {
  const current = await loadState();
  const queueTasks = reconcileInterruptedQueueTasks(current.queueTasks);
  if (queueTasks.some((task, index) => task !== current.queueTasks[index])) {
    await saveState({ ...current, queueTasks });
  }
}
