import "./sidepanel.css";
import type { Campaign, CampaignConfig, QueueTask } from "@horizon/shared";
import type { CanonicalImportedLead, ImportDecisionAction } from "@horizon/shared/deduplication";
import type { ImportIssue } from "@horizon/shared/csv-import";

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

interface ExtensionState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  queueTasks: QueueTask[];
  leads: CanonicalImportedLead[];
  imports: ImportBatch[];
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

type WorkerResponse =
  | { ok: true; state?: ExtensionState; preview?: ImportPreview; importResult?: ImportPreview; counts?: Record<string, number> }
  | { ok: false; error: string };

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const form = document.querySelector<HTMLFormElement>("#campaign-form");
const errorNode = document.querySelector<HTMLElement>("#form-error");
const statusNode = document.querySelector<HTMLElement>("#status");
const nameNode = document.querySelector<HTMLElement>("#campaign-name");
const leadCountNode = document.querySelector<HTMLElement>("#metric-leads");
const draftsCountNode = document.querySelector<HTMLElement>("#metric-drafts");
const contactedCountNode = document.querySelector<HTMLElement>("#metric-contacted");
const pauseButton = document.querySelector<HTMLButtonElement>("#pause");
const resumeButton = document.querySelector<HTMLButtonElement>("#resume");
const stopButton = document.querySelector<HTMLButtonElement>("#stop");
const csvFileNode = document.querySelector<HTMLInputElement>("#csv-file");
const csvFileStatusNode = document.querySelector<HTMLElement>("#csv-file-status");
const previewCsvButton = document.querySelector<HTMLButtonElement>("#preview-csv");
const confirmCsvButton = document.querySelector<HTMLButtonElement>("#confirm-csv");
const importErrorNode = document.querySelector<HTMLElement>("#import-error");
const importPreviewNode = document.querySelector<HTMLElement>("#import-preview");
const importSummaryNode = document.querySelector<HTMLElement>("#import-summary");
const importRowListNode = document.querySelector<HTMLElement>("#import-row-list");
const importIssueListNode = document.querySelector<HTMLUListElement>("#import-issue-list");
const leadCountBadgeNode = document.querySelector<HTMLElement>("#lead-count-badge");
const leadListEmptyNode = document.querySelector<HTMLElement>("#lead-list-empty");
const leadListRowsNode = document.querySelector<HTMLElement>("#lead-list-rows");

let latestState: ExtensionState | null = null;
let selectedCsvText: string | null = null;
let selectedCsvName = "";
let currentPreview: ImportPreview | null = null;
let importCompleted = false;

function requireNode<T extends Element>(value: T | null, selector: string): T {
  if (!value) throw new Error(`Missing required UI element: ${selector}`);
  return value;
}

function getFormConfig(): CampaignConfig {
  const data = new FormData(requireNode(form, "#campaign-form"));
  return {
    name: String(data.get("name") ?? "").trim(),
    niche: String(data.get("niche") ?? "").trim(),
    location: String(data.get("location") ?? "").trim(),
    serviceOffer: String(data.get("serviceOffer") ?? "").trim(),
    targetCount: Number(data.get("targetCount")),
    sourceConfig: {
      csvImport: data.get("csvImport") === "on",
      businessWebsites: data.get("businessWebsites") === "on",
      metaAdLibrary: data.get("metaAdLibrary") === "on",
      instagram: data.get("instagram") === "on"
    },
    demoExists: data.get("demoExists") === "on"
  };
}

async function sendRawMessage(message: Record<string, unknown>): Promise<Exclude<WorkerResponse, { ok: false }>> {
  const response = await chrome.runtime.sendMessage(message) as WorkerResponse;
  if (!response.ok) throw new Error(response.error);
  return response;
}

async function sendMessage(message: Record<string, unknown>): Promise<ExtensionState> {
  const response = await sendRawMessage(message);
  if (!response.state) throw new Error("The extension worker returned no campaign state.");
  return response.state;
}

function activeCampaign(state: ExtensionState): Campaign | undefined {
  return state.campaigns.find((campaign) => campaign.id === state.activeCampaignId);
}

function canImportFor(campaign?: Campaign): boolean {
  return Boolean(
    campaign &&
    campaign.sourceConfig.csvImport &&
    ["queued", "running", "paused"].includes(campaign.status)
  );
}

function updateImportControls(): void {
  const campaign = latestState ? activeCampaign(latestState) : undefined;
  const importEnabled = canImportFor(campaign);
  if (csvFileNode) csvFileNode.disabled = !importEnabled;
  if (previewCsvButton) previewCsvButton.disabled = !importEnabled || !selectedCsvText;
  const previewBelongsToActiveCampaign = Boolean(currentPreview && campaign?.id === currentPreview.campaignId);
  if (confirmCsvButton) {
    confirmCsvButton.disabled = !previewBelongsToActiveCampaign || !currentPreview?.canCommit || importCompleted;
    confirmCsvButton.hidden = !previewBelongsToActiveCampaign || !currentPreview || importCompleted;
  }
  if (csvFileStatusNode && !selectedCsvText) {
    if (!campaign) {
      csvFileStatusNode.textContent = "Create a campaign first, then choose a CSV.";
    } else if (!campaign.sourceConfig.csvImport) {
      csvFileStatusNode.textContent = "CSV / manual import was not enabled in this campaign's source settings.";
    } else if (!importEnabled) {
      csvFileStatusNode.textContent = "Imports are disabled for completed, cancelled, or failed campaigns.";
    } else {
      csvFileStatusNode.textContent = "Choose a CSV to preview it before importing.";
    }
  }
}

function clearImportPreview(): void {
  currentPreview = null;
  importCompleted = false;
  if (importPreviewNode) importPreviewNode.hidden = true;
  if (confirmCsvButton) confirmCsvButton.hidden = true;
  if (importErrorNode) importErrorNode.textContent = "";
  updateImportControls();
}

function renderLeadList(leads: CanonicalImportedLead[]): void {
  const list = requireNode(leadListRowsNode, "#lead-list-rows");
  const empty = requireNode(leadListEmptyNode, "#lead-list-empty");
  list.replaceChildren();

  if (!leads.length) {
    empty.hidden = false;
    empty.textContent = latestState && activeCampaign(latestState)
      ? "No leads in this campaign yet. Import a CSV above."
      : "Create a campaign and import a CSV to populate this queue.";
    return;
  }

  empty.hidden = true;
  for (const lead of [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)) {
    const item = document.createElement("article");
    item.className = "lead-list-row";

    const main = document.createElement("div");
    main.className = "lead-row-main";
    const title = document.createElement("strong");
    title.textContent = lead.businessName;
    const details = document.createElement("small");
    const detailsParts = [
      lead.location,
      lead.websiteDomain,
      lead.instagramUsername ? `@${lead.instagramUsername}` : undefined
    ].filter(Boolean);
    details.textContent = detailsParts.join(" · ") || "No website, handle, or location supplied";

    const metadata = document.createElement("small");
    metadata.className = "lead-row-meta";
    metadata.textContent = `${lead.sourceEvidence.length} source record${lead.sourceEvidence.length === 1 ? "" : "s"} · ${lead.status.replaceAll("_", " ")}`;
    main.append(title, details, metadata);

    const badge = document.createElement("span");
    badge.className = `lead-status-badge ${lead.status === "duplicate_review" || lead.status === "identity_review" ? "needs-review" : ""}`;
    badge.textContent = lead.status.replaceAll("_", " ");
    item.append(main, badge);

    if (lead.reviewFlags.length) {
      const flags = document.createElement("small");
      flags.className = "lead-review-flags";
      flags.textContent = `Review: ${lead.reviewFlags.map((flag) => flag.replaceAll("_", " ")).join(", ")}`;
      item.append(flags);
    }
    list.append(item);
  }
}

function render(state: ExtensionState): void {
  latestState = state;
  const active = activeCampaign(state);
  const activeLeads = active
    ? state.leads.filter((lead) => lead.campaignId === active.id)
    : [];
  statusNode!.textContent = active ? active.status.replaceAll("_", " ") : "No campaign";
  nameNode!.textContent = active
    ? `${active.name} · ${activeLeads.length}/${active.targetCount} leads saved locally.`
    : "Create a campaign to begin. Lead discovery adapters are not enabled in this build.";
  leadCountNode!.textContent = String(activeLeads.length);
  draftsCountNode!.textContent = String(activeLeads.filter((lead) => lead.status === "draft_ready").length);
  contactedCountNode!.textContent = String(activeLeads.filter((lead) => lead.status === "manually_contacted").length);
  leadCountBadgeNode!.textContent = `${activeLeads.length} lead${activeLeads.length === 1 ? "" : "s"}`;
  pauseButton!.disabled = !active || active.status !== "running";
  resumeButton!.disabled = !active || !["paused", "queued"].includes(active.status);
  stopButton!.disabled = !active || !["queued", "running", "paused"].includes(active.status);
  renderLeadList(activeLeads);
  updateImportControls();
}

function makePreviewRow(row: ImportPreviewRow): HTMLElement {
  const item = document.createElement("div");
  item.className = `import-row action-${row.action}`;

  const top = document.createElement("div");
  top.className = "import-row-top";
  const title = document.createElement("strong");
  title.textContent = `Row ${row.rowNumber}: ${row.businessName || "(unnamed row)"}`;
  const action = document.createElement("span");
  action.className = "import-action-label";
  action.textContent = row.action.replaceAll("_", " ");
  top.append(title, action);
  item.append(top);

  if (row.reason) {
    const reason = document.createElement("small");
    reason.textContent = row.reason;
    item.append(reason);
  }
  if (row.reviewFlags?.length) {
    const flags = document.createElement("small");
    flags.textContent = `Review flags: ${row.reviewFlags.map((flag) => flag.replaceAll("_", " ")).join(", ")}`;
    item.append(flags);
  }
  return item;
}

function renderImportPreview(preview: ImportPreview, completed = false): void {
  currentPreview = preview;
  importCompleted = completed;
  requireNode(importPreviewNode, "#import-preview").hidden = false;
  requireNode(importSummaryNode, "#import-summary").textContent = [
    `File: ${preview.fileName}`,
    `Rows: ${preview.totalRows}`,
    `Valid: ${preview.acceptedRows}`,
    `Rejected: ${preview.rejectedRows}`,
    `New leads: ${preview.createdCount}`,
    `Merged: ${preview.mergedCount}`,
    `Already present: ${preview.duplicateCount}`,
    `Needs review: ${preview.needsReviewCount}`,
    `Over capacity: ${preview.overCapacityCount}`,
    `Campaign total: ${preview.finalLeadCount}/${preview.targetCount}`,
    `Warnings: ${preview.warningCount}`
  ].join(" · ");

  const rowList = requireNode(importRowListNode, "#import-row-list");
  rowList.replaceChildren();
  for (const row of preview.rows.slice(0, 30)) rowList.append(makePreviewRow(row));
  if (preview.rows.length > 30) {
    const more = document.createElement("small");
    more.className = "import-help";
    more.textContent = `Showing 30 of ${preview.rows.length} rows. The parser retains full row-level results for import validation.`;
    rowList.append(more);
  }
  if (!preview.rows.length) {
    const empty = document.createElement("small");
    empty.textContent = "No data rows to preview.";
    rowList.append(empty);
  }

  const issueList = requireNode(importIssueListNode, "#import-issue-list");
  issueList.replaceChildren();
  for (const issue of preview.issues.slice(0, 12)) {
    const item = document.createElement("li");
    item.className = issue.severity === "error" ? "issue-error" : "issue-warning";
    item.textContent = [
      issue.rowNumber ? `Row ${issue.rowNumber}: ` : "",
      issue.message
    ].join("");
    issueList.append(item);
  }
  if (preview.issues.length > 12) {
    const item = document.createElement("li");
    item.textContent = `Plus ${preview.issues.length - 12} additional validation messages (first 100 retained in preview).`;
    issueList.append(item);
  }
  if (completed) {
    importErrorNode!.textContent = "Import saved to this Chrome profile. Cloud sync is not configured.";
    importErrorNode!.classList.remove("error");
    importErrorNode!.classList.add("import-success");
  } else {
    importErrorNode!.textContent = preview.canCommit
      ? "Review the preview and validation notes, then confirm the import."
      : "Nothing can be imported from this file. Fix the file or row errors and preview it again.";
    importErrorNode!.classList.add("error");
    importErrorNode!.classList.remove("import-success");
  }
  updateImportControls();
}

async function refresh(): Promise<void> {
  const state = await sendMessage({ type: "GET_STATE" });
  render(state);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorNode!.textContent = "";
  clearImportPreview();
  try {
    const config = getFormConfig();
    const state = await sendMessage({ type: "CREATE_CAMPAIGN", config });
    render(state);
  } catch (error) {
    errorNode!.textContent = error instanceof Error ? error.message : "Could not create campaign.";
  }
});

pauseButton?.addEventListener("click", async () => {
  try {
    const state = await getCurrentState();
    if (state.activeCampaignId) render(await sendMessage({ type: "PAUSE_CAMPAIGN", campaignId: state.activeCampaignId }));
  } catch (error) { errorNode!.textContent = error instanceof Error ? error.message : "Could not pause campaign."; }
});

resumeButton?.addEventListener("click", async () => {
  try {
    const state = await getCurrentState();
    if (state.activeCampaignId) render(await sendMessage({ type: "RESUME_CAMPAIGN", campaignId: state.activeCampaignId }));
  } catch (error) { errorNode!.textContent = error instanceof Error ? error.message : "Could not resume campaign."; }
});

stopButton?.addEventListener("click", async () => {
  try {
    const state = await getCurrentState();
    if (state.activeCampaignId) render(await sendMessage({ type: "STOP_CAMPAIGN", campaignId: state.activeCampaignId }));
  } catch (error) { errorNode!.textContent = error instanceof Error ? error.message : "Could not stop campaign."; }
});

csvFileNode?.addEventListener("change", async () => {
  clearImportPreview();
  selectedCsvText = null;
  selectedCsvName = "";
  const file = csvFileNode.files?.[0];
  if (!file) {
    updateImportControls();
    return;
  }
  if (file.size > MAX_CSV_BYTES) {
    importErrorNode!.textContent = "CSV exceeds the 2 MB limit. Export a smaller file and try again.";
    csvFileStatusNode!.textContent = "File rejected due to size.";
    updateImportControls();
    return;
  }
  try {
    const text = await file.text();
    if (csvFileNode.files?.[0] !== file) return;
    selectedCsvText = text;
    selectedCsvName = file.name;
    csvFileStatusNode!.textContent = `Loaded ${file.name} · ${file.size.toLocaleString()} bytes. Preview before importing.`;
  } catch (error) {
    importErrorNode!.textContent = error instanceof Error ? error.message : "Could not read the selected CSV.";
    csvFileStatusNode!.textContent = "File could not be read.";
  }
  updateImportControls();
});

previewCsvButton?.addEventListener("click", async () => {
  importErrorNode!.textContent = "";
  try {
    if (!selectedCsvText) throw new Error("Choose a CSV file first.");
    const state = await getCurrentState();
    if (!state.activeCampaignId) throw new Error("Create a campaign before importing leads.");
    const response = await sendRawMessage({
      type: "PREVIEW_CSV_IMPORT",
      campaignId: state.activeCampaignId,
      fileName: selectedCsvName,
      csvText: selectedCsvText
    });
    if (!response.preview) throw new Error("The worker returned no CSV preview.");
    renderImportPreview(response.preview);
  } catch (error) {
    importErrorNode!.textContent = error instanceof Error ? error.message : "Could not preview the CSV.";
    importErrorNode!.classList.add("error");
    importErrorNode!.classList.remove("import-success");
  }
});

confirmCsvButton?.addEventListener("click", async () => {
  importErrorNode!.textContent = "";
  try {
    if (!selectedCsvText || !currentPreview?.canCommit) throw new Error("Preview a valid CSV before importing.");
    const state = await getCurrentState();
    if (!state.activeCampaignId || state.activeCampaignId !== currentPreview.campaignId) {
      throw new Error("The active campaign changed. Preview the CSV again for the current campaign.");
    }
    const response = await sendRawMessage({
      type: "COMMIT_CSV_IMPORT",
      campaignId: state.activeCampaignId,
      fileName: selectedCsvName,
      csvText: selectedCsvText
    });
    if (!response.state || !response.importResult) throw new Error("The worker returned no import result.");
    render(response.state);
    renderImportPreview(response.importResult, true);
  } catch (error) {
    importErrorNode!.textContent = error instanceof Error ? error.message : "Could not import the CSV.";
    importErrorNode!.classList.add("error");
    importErrorNode!.classList.remove("import-success");
  }
});

async function getCurrentState(): Promise<ExtensionState> {
  return sendMessage({ type: "GET_STATE" });
}

void refresh().catch((error: unknown) => {
  errorNode!.textContent = error instanceof Error ? error.message : "Could not load saved state.";
});
