# Chrome extension

Initial Manifest V3 side-panel scaffold for Phase 1.

## Build locally

Use Node.js 22+ in a network-enabled environment. From the repository root:

```sh
npm install
npm test
npm run typecheck
npm run build --workspace @horizon/extension
```

Then open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and choose `extension/dist`. The GitHub Actions workflow also uploads the built `extension/dist` folder as an artifact named `horizon-agent-chrome-extension` when its CI run passes.

## What works in this foundation

- Campaign setup with a target count from 1 to 100.
- Campaign persistence in `chrome.storage.local` for this Chrome profile.
- Validated queued/running/paused/cancelled campaign state transitions.
- Persistent queue-task primitives in the extension worker: enqueue, transition status, count task states, and safe handling of interrupted tasks.
- Pause/resume/stop controls.
- Side-panel UI and saved campaign state.

## Not connected yet

The current campaign UI does not import leads or execute live source adapters. Supabase is not connected at runtime and the current queue is local to this Chrome profile. Gemini drafting, browser tab navigation, and Instagram inspection are not implemented. These are later-phase work.

The manifest deliberately has no host permissions and no content scripts. Meta/Instagram extraction remains gated pending review of the specific access method. Google Maps scraping is out of scope. No automated message sending exists.
