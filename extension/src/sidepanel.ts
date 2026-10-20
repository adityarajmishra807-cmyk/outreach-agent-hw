import "./sidepanel.css";
import type { Campaign, CampaignConfig } from "@horizon/shared";

interface ExtensionState {
  campaigns: Campaign[];
  activeCampaignId: string | null;
}

type ResponseMessage = { ok: true; state: ExtensionState } | { ok: false; error: string };

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

async function sendMessage(message: Record<string, unknown>): Promise<ExtensionState> {
  const response = await chrome.runtime.sendMessage(message) as ResponseMessage;
  if (!response.ok) throw new Error(response.error);
  return response.state;
}

function render(state: ExtensionState): void {
  const active = state.campaigns.find((campaign) => campaign.id === state.activeCampaignId);
  statusNode!.textContent = active ? active.status.replaceAll("_", " ") : "No campaign";
  nameNode!.textContent = active
    ? `${active.name} · Queue saved locally. Lead discovery is not connected yet.`
    : "Create a campaign to begin. Lead discovery adapters are not enabled in this foundation build.";
  leadCountNode!.textContent = "0";
  draftsCountNode!.textContent = "0";
  contactedCountNode!.textContent = "0";
  pauseButton!.disabled = !active || active.status !== "running";
  resumeButton!.disabled = !active || !["paused", "queued"].includes(active.status);
  stopButton!.disabled = !active || !["queued", "running", "paused"].includes(active.status);
}

async function refresh(): Promise<void> {
  const state = await sendMessage({ type: "GET_STATE" });
  render(state);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorNode!.textContent = "";
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

async function getCurrentState(): Promise<ExtensionState> {
  return sendMessage({ type: "GET_STATE" });
}

void refresh().catch((error: unknown) => {
  errorNode!.textContent = error instanceof Error ? error.message : "Could not load saved state.";
});
