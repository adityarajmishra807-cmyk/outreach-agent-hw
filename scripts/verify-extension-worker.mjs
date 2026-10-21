import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const workerSource = readFileSync(workerPath, "utf8");

function startWorker() {
  const context = vm.createContext({
    chrome,
    crypto,
    URL,
    TextEncoder,
    console,
    setTimeout,
    clearTimeout
  });
  vm.runInContext(workerSource, context, { filename: workerPath });
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

startWorker();

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
startWorker();
const recovered = success(await send({ type: "GET_STATE" }), "Get state after worker restart").state;
assert.equal(recovered.queueTasks.find((task) => task.id === "harness-task-1").status, "needs_review");

console.log("Built service-worker runtime verification passed (campaign state, CSV preview/commit, idempotency, provenance, export, cap, validation, failed writes, and restart recovery).");
