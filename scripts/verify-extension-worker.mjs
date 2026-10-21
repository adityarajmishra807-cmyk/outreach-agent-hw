import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import crypto from "node:crypto";

const workerPath = resolve(process.cwd(), "extension/dist/background.js");
const stateKey = "horizon-outreach-state-v1";
const stored = new Map();
let failNextWrite = false;
let onMessageListener;
let onInstalledListener;
let WorkerError = Error;

const chrome = {
  storage: {
    local: {
      async get(key) {
        return stored.has(key) ? { [key]: structuredClone(stored.get(key)) } : {};
      },
      async set(record) {
        if (failNextWrite) {
          failNextWrite = false;
          throw new WorkerError("Injected storage write failure");
        }
        for (const [key, value] of Object.entries(record)) stored.set(key, structuredClone(value));
      }
    }
  },
  runtime: {
    onInstalled: { addListener(listener) { onInstalledListener = listener; } },
    onMessage: { addListener(listener) { onMessageListener = listener; } }
  },
  sidePanel: { async setPanelBehavior() { return {}; } }
};

// The MV3 manifest declares a module service worker. Execute the emitted ESM
// module graph in a fresh VM context per start, resolving only local packaged chunks.
// This validates module entrypoints without relying on a live Chrome installation.
async function startWorker() {
  const context = vm.createContext({
    chrome,
    crypto,
    URL,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout,
    structuredClone
  });
  const moduleCache = new Map();

  function moduleFor(filePath) {
    const absolutePath = resolve(filePath);
    const relativePath = relative(resolve(process.cwd(), "extension/dist"), absolutePath);
    assert.ok(
      relativePath && relativePath !== ".." && !relativePath.startsWith(".." + sep),
      "Worker imported a module outside extension/dist: " + absolutePath
    );
    assert.ok(absolutePath.endsWith(".js"), "Unexpected imported worker module: " + absolutePath);
    if (moduleCache.has(absolutePath)) return moduleCache.get(absolutePath);

    const source = readFileSync(absolutePath, "utf8");
    const mod = new vm.SourceTextModule(source, {
      context,
      identifier: pathToFileURL(absolutePath).href,
      initializeImportMeta(meta) {
        meta.url = pathToFileURL(absolutePath).href;
      }
    });
    moduleCache.set(absolutePath, mod);
    return mod;
  }

  const entry = moduleFor(workerPath);
  await entry.link(async (specifier, referencingModule) => {
    const referencingPath = fileURLToPath(referencingModule.identifier);
    let importedUrl;
    try {
      importedUrl = new URL(specifier, pathToFileURL(referencingPath));
    } catch {
      throw new Error("Invalid worker module import: " + specifier);
    }
    assert.equal(importedUrl.protocol, "file:", "Worker may only import packaged local modules.");
    return moduleFor(fileURLToPath(importedUrl));
  });
  await entry.evaluate();
  WorkerError = vm.runInContext("Error", context);
  assert.equal(typeof onMessageListener, "function", "Worker message listener was not registered.");
  assert.equal(typeof onInstalledListener, "function", "Worker install listener was not registered.");
}

function send(message) {
  return new Promise((resolveMessage, rejectMessage) => {
    let settled = false;
    const callback = (response) => {
      if (settled) return;
      settled = true;
      resolveMessage(response);
    };
    try {
      const keepAlive = onMessageListener(message, {}, callback);
      if (keepAlive !== true) rejectMessage(new Error("Async message response channel was not retained."));
    } catch (error) {
      rejectMessage(error);
    }
  });
}

function success(response, label) {
  assert.equal(response?.ok, true, label + " failed: " + (response?.error ?? "unknown error"));
  return response;
}

function failure(response, expectedText, label) {
  assert.equal(response?.ok, false, label + " unexpectedly succeeded.");
  assert.ok(
    response.error.includes(expectedText),
    label + ": expected error containing " + JSON.stringify(expectedText) + ", received " + JSON.stringify(response.error)
  );
}

const config = {
  name: "Runtime harness campaign",
  niche: "Gyms",
  location: "Dehradun",
  serviceOffer: "Website design",
  targetCount: 2,
  sourceConfig: { csvImport: true, businessWebsites: false, metaAdLibrary: false, instagram: false },
  demoExists: false
};

const csv = [
  "businessName,location,website,instagramUsername,sourceUrl,notes",
  'North Gym,Dehradun,https://north.example,northgym,https://north.example,"Strong gym, open late"',
  "North Gym,Dehradun,https://north.example,northgym,https://directory.example/north,Second source",
  ",Dehradun,,,,",
  "Other Gym,Dehradun,https://other.example,othergym,,"
].join("\n");

await startWorker();

// Concurrent state mutations should not overwrite one another.
const [createdA, createdB] = await Promise.all([
  send({ type: "CREATE_CAMPAIGN", config: { ...config, name: "Concurrent A" } }),
  send({ type: "CREATE_CAMPAIGN", config: { ...config, name: "Concurrent B" } })
]);
success(createdA, "Concurrent create A");
success(createdB, "Concurrent create B");
let current = success(await send({ type: "GET_STATE" }), "Get state").state;
assert.equal(current.campaigns.length, 2);
const campaign = current.campaigns.find((item) => item.name === "Concurrent A");
assert.ok(campaign);

// Preview should compute outcome without writing leads or import history.
const preview = success(await send({
  type: "PREVIEW_CSV_IMPORT",
  campaignId: campaign.id,
  fileName: "test-leads.csv",
  csvText: csv
}), "CSV preview").preview;
assert.deepEqual(JSON.parse(JSON.stringify({
  created: preview.createdCount,
  merged: preview.mergedCount,
  rejected: preview.rejectedRows,
  overCapacity: preview.overCapacityCount,
  finalCount: preview.finalLeadCount
})), { created: 2, merged: 1, rejected: 1, overCapacity: 0, finalCount: 2 });
current = success(await send({ type: "GET_STATE" }), "Get state after preview").state;
assert.equal(current.leads.length, 0);
assert.equal(current.imports.length, 0);

// Commit should save the expected canonical leads, audit batch, and merged source provenance.
const committed = success(await send({
  type: "COMMIT_CSV_IMPORT",
  campaignId: campaign.id,
  fileName: "test-leads.csv",
  csvText: csv
}), "Commit CSV import");
assert.equal(committed.state.leads.length, 2);
assert.equal(committed.state.imports.length, 1);
const north = committed.state.leads.find((lead) => lead.instagramUsername === "northgym");
assert.equal(north.sourceEvidence.length, 2);

// Re-importing the same file must not create another lead or duplicate source evidence.
const repeated = success(await send({
  type: "COMMIT_CSV_IMPORT",
  campaignId: campaign.id,
  fileName: "test-leads.csv",
  csvText: csv
}), "Repeat import");
assert.equal(repeated.state.leads.length, 2);
assert.equal(repeated.importResult.duplicateCount, 3);
assert.equal(repeated.state.leads.find((lead) => lead.id === north.id).sourceEvidence.length, 2);

// Exceptions export should contain a corrected CSV with status and reason fields.
const exceptions = success(await send({
  type: "EXPORT_CSV_EXCEPTIONS",
  campaignId: campaign.id,
  fileName: "test-leads.csv",
  csvText: csv
}), "Exceptions export");
assert.equal(exceptions.exceptionCount, 1);
assert.ok(exceptions.csvText.includes("rejected"));
assert.ok(exceptions.csvText.includes("Business name is required."));

// Capacity should be enforced in both preview and commit.
const capCsv = [
  "businessName,website,instagramUsername",
  "North Gym,https://north.example,northgym",
  "Other Gym,https://other.example,othergym",
  "Third Gym,https://third.example,thirdgym"
].join("\n");
const capPreview = success(await send({
  type: "PREVIEW_CSV_IMPORT",
  campaignId: campaign.id,
  fileName: "capacity.csv",
  csvText: capCsv
}), "Capacity preview").preview;
assert.equal(capPreview.finalLeadCount, 2);
assert.equal(capPreview.overCapacityCount, 1);
const capCommit = success(await send({
  type: "COMMIT_CSV_IMPORT",
  campaignId: campaign.id,
  fileName: "capacity.csv",
  csvText: capCsv
}), "Capacity commit");
assert.equal(capCommit.state.leads.length, 2);
assert.equal(capCommit.importResult.overCapacityCount, 1);

// Campaign source settings and campaign identity must be validated on import.
const nonCsv = success(await send({
  type: "CREATE_CAMPAIGN",
  config: {
    ...config,
    sourceConfig: { csvImport: false, businessWebsites: false, metaAdLibrary: false, instagram: true }
  }
}), "Create campaign without CSV source");
failure(await send({
  type: "PREVIEW_CSV_IMPORT",
  campaignId: nonCsv.state.activeCampaignId,
  fileName: "x.csv",
  csvText: "businessName\nGym"
}), "CSV / manual import was not enabled", "CSV source gating");
failure(await send({
  type: "PREVIEW_CSV_IMPORT",
  campaignId: "missing-campaign",
  fileName: "x.csv",
  csvText: "businessName\nGym"
}), "Campaign not found", "Unknown campaign");

// Manual intake is source-gated, idempotent, and records evidence locally.
const manualCampaignResponse = success(await send({
  type: "CREATE_CAMPAIGN",
  config: {
    ...config,
    name: "Manual source intake",
    targetCount: 2,
    sourceConfig: { csvImport: false, businessWebsites: true, metaAdLibrary: false, instagram: false }
  }
}), "Create manual-source campaign");
const manualCampaignId = manualCampaignResponse.state.activeCampaignId;
const manualLead = {
  businessName: "Manual North Gym",
  websiteUrl: "https://manual-north.example/services",
  sourceType: "business_website",
  notes: "User-reviewed test record"
};
const manualAdded = success(await send({
  type: "ADD_MANUAL_LEAD",
  campaignId: manualCampaignId,
  lead: manualLead
}), "Add manual source lead");
assert.equal(manualAdded.manualResult.action, "created");
assert.equal(manualAdded.state.leads.filter((lead) => lead.campaignId === manualCampaignId).length, 1);
assert.equal(manualAdded.state.sourceEvents[0].sourceUrl, "https://manual-north.example/services");
const manualRepeated = success(await send({
  type: "ADD_MANUAL_LEAD",
  campaignId: manualCampaignId,
  lead: manualLead
}), "Repeat manual source lead");
assert.equal(manualRepeated.manualResult.action, "duplicate");
assert.equal(manualRepeated.state.leads.filter((lead) => lead.campaignId === manualCampaignId).length, 1);
failure(await send({
  type: "ADD_MANUAL_LEAD",
  campaignId: campaign.id,
  lead: { businessName: "Disabled Website Source", websiteUrl: "https://disabled.example", sourceType: "business_website" }
}), "This source is disabled", "Manual source gating");

// Research notes require a lead, a specific observation, and a valid evidence URL.
const manualLeadId = manualAdded.state.leads.find((lead) => lead.campaignId === manualCampaignId).id;
const researchInput = {
  leadId: manualLeadId,
  category: "services_offered",
  observation: "The services page lists personal training and small-group coaching.",
  evidenceUrl: "https://manual-north.example/services#overview",
  potentialOpportunity: "A clearer enquiry path might help visitors compare coaching options.",
  confidence: "needs_verification"
};
const researchAdded = success(await send({
  type: "ADD_RESEARCH_NOTE",
  campaignId: manualCampaignId,
  note: researchInput
}), "Add research note");
assert.equal(researchAdded.researchResult.created, true);
assert.equal(researchAdded.researchResult.note.evidenceUrl, "https://manual-north.example/services");
assert.equal(researchAdded.state.researchNotes.length, 1);
assert.equal(researchAdded.state.researchNotes[0].leadId, manualLeadId);
const researchRepeated = success(await send({
  type: "ADD_RESEARCH_NOTE",
  campaignId: manualCampaignId,
  note: researchInput
}), "Repeat research note");
assert.equal(researchRepeated.researchResult.created, false);
assert.equal(researchRepeated.state.researchNotes.length, 1);
failure(await send({
  type: "ADD_RESEARCH_NOTE",
  campaignId: manualCampaignId,
  note: { ...researchInput, evidenceUrl: "javascript:alert(1)" }
}), "valid evidence URL", "Research evidence URL validation");
failure(await send({
  type: "ADD_RESEARCH_NOTE",
  campaignId: manualCampaignId,
  note: { ...researchInput, leadId: "not-a-lead" }
}), "Choose a lead from the active campaign", "Research lead campaign ownership");

// Invalid rows can be previewed but not committed.
const invalidCsv = "businessName,location\n,Dehradun\n";
const invalidPreview = success(await send({
  type: "PREVIEW_CSV_IMPORT",
  campaignId: campaign.id,
  fileName: "invalid.csv",
  csvText: invalidCsv
}), "Invalid CSV preview").preview;
assert.equal(invalidPreview.canCommit, false);
assert.equal(invalidPreview.rejectedRows, 1);
failure(await send({
  type: "COMMIT_CSV_IMPORT",
  campaignId: campaign.id,
  fileName: "invalid.csv",
  csvText: invalidCsv
}), "no valid business rows", "Commit invalid CSV");

// A storage write error should be reported and not persist the attempted campaign.
failNextWrite = true;
failure(await send({
  type: "CREATE_CAMPAIGN",
  config: { ...config, name: "Must not persist" }
}), "Injected storage write failure", "Storage error handling");
current = success(await send({ type: "GET_STATE" }), "State after storage error").state;
assert.equal(current.campaigns.some((item) => item.name === "Must not persist"), false);

// Simulate service-worker termination/restart: interrupted work goes to review.
success(await send({ type: "RESUME_CAMPAIGN", campaignId: campaign.id }), "Resume campaign");
success(await send({
  type: "ENQUEUE_TASK",
  taskId: "harness-task-1",
  campaignId: campaign.id,
  leadId: north.id
}), "Enqueue queue task");
const processing = success(await send({
  type: "TRANSITION_TASK",
  taskId: "harness-task-1",
  nextStatus: "processing"
}), "Mark task processing");
assert.equal(processing.state.queueTasks.find((task) => task.id === "harness-task-1").attempts, 1);
await startWorker();
const recovered = success(await send({ type: "GET_STATE" }), "Get state after worker restart").state;
assert.equal(recovered.queueTasks.find((task) => task.id === "harness-task-1").status, "needs_review");
assert.equal(recovered.researchNotes.length, 1);
assert.equal(recovered.researchNotes[0].leadId, manualLeadId);

console.log("Built service-worker runtime verification passed (campaign state, CSV workflow, source intake, evidence-first research notes, idempotency, validation, failed writes, and restart recovery).");
