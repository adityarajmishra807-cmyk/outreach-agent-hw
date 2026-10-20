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

const STORAGE_KEY = "horizon-outreach-state-v1";

interface ExtensionState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
  queueTasks: QueueTask[];
}

type ExtensionMessage =
  | { type: "GET_STATE" }
  | { type: "CREATE_CAMPAIGN"; config: CampaignConfig }
  | { type: "PAUSE_CAMPAIGN"; campaignId: string }
  | { type: "RESUME_CAMPAIGN"; campaignId: string }
  | { type: "STOP_CAMPAIGN"; campaignId: string }
  | { type: "ENQUEUE_TASK"; taskId: string; campaignId: string; leadId: string }
  | { type: "TRANSITION_TASK"; taskId: string; nextStatus: QueueTaskStatus; error?: string }
  | { type: "GET_QUEUE_COUNTS"; campaignId: string };

const EMPTY_STATE: ExtensionState = { campaigns: [], activeCampaignId: null, queueTasks: [] };

async function loadState(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const raw = stored[STORAGE_KEY] as Partial<ExtensionState> | undefined;
  return {
    campaigns: raw?.campaigns ?? [],
    activeCampaignId: raw?.activeCampaignId ?? null,
    queueTasks: raw?.queueTasks ?? []
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
        return { ok: true, state: await createCampaign(message.config) };
      case "PAUSE_CAMPAIGN":
        return { ok: true, state: await transitionActiveCampaign(message.campaignId, "paused") };
      case "RESUME_CAMPAIGN":
        return { ok: true, state: await transitionActiveCampaign(message.campaignId, "running") };
      case "STOP_CAMPAIGN":
        return { ok: true, state: await transitionActiveCampaign(message.campaignId, "cancelled") };
      case "ENQUEUE_TASK":
        return { ok: true, state: await enqueueTask(message) };
      case "TRANSITION_TASK":
        return { ok: true, state: await updateTask(message) };
      case "GET_QUEUE_COUNTS": {
        await ensureRecovered();
        const state = await loadState();
        if (!state.campaigns.some((campaign) => campaign.id === message.campaignId)) throw new Error("Campaign not found.");
        return { ok: true, counts: countQueueTasks(state.queueTasks, message.campaignId) };
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
