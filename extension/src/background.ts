import {
  canTransitionCampaign,
  type Campaign,
  type CampaignConfig,
  transitionCampaign,
  validateCampaignConfig
} from "@horizon/shared";

const STORAGE_KEY = "horizon-outreach-state-v1";

interface ExtensionState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
}

type ExtensionMessage =
  | { type: "GET_STATE" }
  | { type: "CREATE_CAMPAIGN"; config: CampaignConfig }
  | { type: "PAUSE_CAMPAIGN"; campaignId: string }
  | { type: "RESUME_CAMPAIGN"; campaignId: string }
  | { type: "STOP_CAMPAIGN"; campaignId: string };

const EMPTY_STATE: ExtensionState = { campaigns: [], activeCampaignId: null };

async function loadState(): Promise<ExtensionState> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as ExtensionState | undefined) ?? EMPTY_STATE;
}

async function saveState(state: ExtensionState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function makeId(): string {
  return crypto.randomUUID();
}

async function createCampaign(config: CampaignConfig): Promise<ExtensionState> {
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
  const next = { campaigns: [campaign, ...current.campaigns], activeCampaignId: campaign.id };
  await saveState(next);
  return next;
}

async function transitionActiveCampaign(
  campaignId: string,
  nextStatus: Campaign["status"]
): Promise<ExtensionState> {
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
  const next = {
    campaigns: current.campaigns.map((campaign) => campaign.id === campaignId ? updated : campaign),
    activeCampaignId: current.activeCampaignId
  };
  await saveState(next);
  return next;
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  const run = async (): Promise<ExtensionState> => {
    switch (message.type) {
      case "GET_STATE":
        return loadState();
      case "CREATE_CAMPAIGN":
        return createCampaign(message.config);
      case "PAUSE_CAMPAIGN":
        return transitionActiveCampaign(message.campaignId, "paused");
      case "RESUME_CAMPAIGN":
        return transitionActiveCampaign(message.campaignId, "running");
      case "STOP_CAMPAIGN":
        return transitionActiveCampaign(message.campaignId, "cancelled");
    }
  };

  void run()
    .then((state) => sendResponse({ ok: true, state }))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : "Unexpected extension error."
    }));
  return true;
});
