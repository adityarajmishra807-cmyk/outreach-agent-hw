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


export type QueueTaskStatus = "pending" | "processing" | "completed" | "needs_review" | "failed" | "skipped";

export interface QueueTask {
  id: string;
  campaignId: string;
  leadId: string;
  status: QueueTaskStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueueTaskInput {
  id: string;
  campaignId: string;
  leadId: string;
}

export interface EnqueueResult {
  tasks: QueueTask[];
  task: QueueTask;
  created: boolean;
}

const queueTaskTransitions: Record<QueueTaskStatus, readonly QueueTaskStatus[]> = {
  pending: ["processing", "skipped"],
  processing: ["completed", "needs_review", "failed"],
  completed: [],
  needs_review: ["pending", "skipped"],
  failed: ["pending", "skipped"],
  skipped: []
};

export function canTransitionQueueTask(from: QueueTaskStatus, to: QueueTaskStatus): boolean {
  return queueTaskTransitions[from].includes(to);
}

export function transitionQueueTask(
  task: QueueTask,
  nextStatus: QueueTaskStatus,
  options: { error?: string; now?: string } = {}
): QueueTask {
  if (!canTransitionQueueTask(task.status, nextStatus)) {
    throw new Error(`Invalid queue task transition: ${task.status} -> ${nextStatus}`);
  }
  // One initial attempt plus at most two retries, as specified for transient failures.
  if (
    (nextStatus === "processing" && task.attempts >= 3) ||
    (nextStatus === "pending" && task.status === "failed" && task.attempts >= 3)
  ) {
    throw new Error("Queue task retry budget exhausted; review the task manually.");
  }
  const now = options.now ?? new Date().toISOString();
  const next: QueueTask = { ...task, status: nextStatus, updatedAt: now };
  if (nextStatus === "processing") next.attempts += 1;
  if (options.error) next.lastError = options.error;
  else if (nextStatus === "pending" || nextStatus === "completed") delete next.lastError;
  return next;
}

/** Adds one task idempotently; duplicate campaign/lead pairs do not create a second job. */
export function enqueueQueueTask(
  existing: QueueTask[],
  input: QueueTaskInput,
  campaignTarget: number,
  now = new Date().toISOString()
): EnqueueResult {
  if (!input.id.trim() || !input.campaignId.trim() || !input.leadId.trim()) {
    throw new Error("Queue task ID, campaign ID, and lead ID are required.");
  }
  if (!Number.isInteger(campaignTarget) || campaignTarget < 1 || campaignTarget > 100) {
    throw new Error("Campaign target must be an integer between 1 and 100.");
  }

  const duplicate = existing.find((task) => task.campaignId === input.campaignId && task.leadId === input.leadId);
  if (duplicate) return { tasks: existing, task: duplicate, created: false };

  const campaignCount = existing.filter((task) => task.campaignId === input.campaignId).length;
  if (campaignCount >= campaignTarget || campaignCount >= 100) {
    throw new Error("Campaign lead queue is at its configured limit.");
  }
  if (existing.some((task) => task.id === input.id)) {
    throw new Error("Queue task ID already exists.");
  }

  const task: QueueTask = {
    ...input,
    status: "pending",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
  return { tasks: [...existing, task], task, created: true };
}

/** In-progress tasks are sent to review on recovery rather than blindly repeated. */
export function reconcileInterruptedQueueTasks(tasks: QueueTask[], now = new Date().toISOString()): QueueTask[] {
  return tasks.map((task) => task.status === "processing"
    ? transitionQueueTask(task, "needs_review", { error: "Interrupted while processing; verify the last checkpoint before retrying.", now })
    : task);
}

export function countQueueTasks(tasks: QueueTask[], campaignId: string): Record<QueueTaskStatus, number> {
  const counts: Record<QueueTaskStatus, number> = {
    pending: 0, processing: 0, completed: 0, needs_review: 0, failed: 0, skipped: 0
  };
  for (const task of tasks) if (task.campaignId === campaignId) counts[task.status] += 1;
  return counts;
}


export function cancelPendingQueueTasks(tasks: QueueTask[], campaignId: string, now = new Date().toISOString()): QueueTask[] {
  return tasks.map((task) => {
    if (task.campaignId !== campaignId) return task;
    if (task.status === "pending") {
      return transitionQueueTask(task, "skipped", { error: "Campaign cancelled by user.", now });
    }
    if (task.status === "processing") {
      return transitionQueueTask(task, "needs_review", {
        error: "Campaign cancelled while task was processing; verify state before retrying.",
        now
      });
    }
    return task;
  });
}
