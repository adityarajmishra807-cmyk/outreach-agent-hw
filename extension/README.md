# Chrome extension

This is the initial Manifest V3 side-panel scaffold for Phase 1.

## Build locally

From the repository root:

```sh
npm install
npm run build --workspace @horizon/extension
```

Then open `chrome://extensions`, enable Developer mode, select **Load unpacked**, and choose `extension/dist`.

This scaffold uses `chrome.storage.local` for the initial local campaign queue. It is not cloud-synced yet; Supabase is planned as the durable backend store in the next integration step. The side panel creates campaign records and supports pause/resume/stop state transitions. Lead ingestion, Gemini drafting, and Instagram page interaction are not connected yet.

The manifest deliberately has no host permissions and no content scripts. Source adapters remain disabled until their access method is reviewed. No automated message sending exists.
