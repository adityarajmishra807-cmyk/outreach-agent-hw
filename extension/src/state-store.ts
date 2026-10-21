import {
  createEmptyExtensionState,
  normalizeExtensionState,
  type ExtensionState
} from "../../packages/shared/src/import-workflow";

export const EXTENSION_STATE_STORAGE_KEY = "horizon-outreach-state-v1";

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface ExtensionStateStore {
  load(): Promise<ExtensionState>;
  save(state: ExtensionState): Promise<void>;
}

/**
 * Thin persistence boundary around Chrome storage. The full state record is
 * written under one key so the campaign, queue, leads, and import history move
 * together as a single storage operation.
 */
export function createExtensionStateStore(storage: StorageAreaLike): ExtensionStateStore {
  return {
    async load(): Promise<ExtensionState> {
      const stored = await storage.get(EXTENSION_STATE_STORAGE_KEY);
      const raw = stored[EXTENSION_STATE_STORAGE_KEY];
      return raw === undefined ? createEmptyExtensionState() : normalizeExtensionState(raw);
    },

    async save(state: ExtensionState): Promise<void> {
      await storage.set({ [EXTENSION_STATE_STORAGE_KEY]: state });
    }
  };
}
