export type CampaignStatus =
  | "draft"
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export type LeadStatus =
  | "discovered"
  | "duplicate_review"
  | "identity_review"
  | "research_pending"
  | "researching"
  | "research_complete"
  | "draft_pending"
  | "drafting"
  | "draft_ready"
  | "manually_contacted"
  | "follow_up"
  | "skipped"
  | "failed"
  | "paused";

export type LeadSource =
  | "meta_ad_library_manual"
  | "instagram_manual"
  | "business_website"
  | "google_maps_manual"
  | "csv_import"
  | "other_permitted_source";

export interface CampaignConfig {
  name: string;
  niche: string;
  location: string;
  serviceOffer: string;
  targetCount: number;
  sourceConfig: {
    metaAdLibrary: boolean;
    instagram: boolean;
    businessWebsites: boolean;
    csvImport: boolean;
  };
  demoExists: boolean;
}

export interface Campaign extends CampaignConfig {
  id: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  campaignId: string;
  businessName: string;
  normalizedName: string;
  location?: string;
  websiteUrl?: string;
  instagramUsername?: string;
  instagramUrl?: string;
  identityStatus: "unmatched" | "candidate" | "verified" | "rejected";
  status: LeadStatus;
  sources: LeadSource[];
  score?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Draft {
  id: string;
  leadId: string;
  text: string;
  status: "draft" | "needs_review" | "approved_for_manual_use" | "manually_sent" | "skipped";
  evidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
}

const campaignTransitions: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["queued", "cancelled"],
  queued: ["running", "paused", "cancelled"],
  running: ["paused", "completed", "cancelled", "failed"],
  paused: ["running", "cancelled", "failed"],
  completed: [],
  cancelled: [],
  failed: ["queued", "cancelled"]
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return campaignTransitions[from].includes(to);
}

export function transitionCampaign<T extends { status: CampaignStatus }>(
  campaign: T,
  nextStatus: CampaignStatus
): Omit<T, "status"> & { status: CampaignStatus } {
  if (!canTransitionCampaign(campaign.status, nextStatus)) {
    throw new Error(`Invalid campaign transition: ${campaign.status} -> ${nextStatus}`);
  }

  return { ...campaign, status: nextStatus };
}

export function validateCampaignConfig(config: CampaignConfig): string[] {
  const errors: string[] = [];
  if (!config.name.trim()) errors.push("Campaign name is required.");
  if (!config.niche.trim()) errors.push("Business niche is required.");
  if (!config.location.trim()) errors.push("Target location is required.");
  if (!config.serviceOffer.trim()) errors.push("A Horizon Works service is required.");
  if (!Number.isInteger(config.targetCount) || config.targetCount < 1 || config.targetCount > 100) {
    errors.push("Target count must be an integer between 1 and 100.");
  }
  if (!Object.values(config.sourceConfig).some(Boolean)) {
    errors.push("Enable at least one lead source.");
  }
  return errors;
}

export function normalizeBusinessName(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function normalizeInstagramUsername(username: string): string {
  return username.trim().replace(/^@+/, "").toLowerCase();
}

export function normalizeWebsiteDomain(input: string): string | null {
  try {
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    const url = new URL(withScheme);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
