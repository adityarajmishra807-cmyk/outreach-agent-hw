# Chrome extension

Chrome Manifest V3 side panel for the Horizon Works Outreach Agent.

## Build locally

Use Node.js 22+ in a network-enabled environment. From the repository root:

```sh
npm install
npm test
npm run typecheck
npm run build --workspace @horizon/extension
```

Then open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and choose `extension/dist`. The GitHub Actions workflow also uploads the built extension folder as `horizon-agent-chrome-extension` when CI passes.

## Current features

- Create a campaign with a target of 1–100 leads.
- Persist campaigns and queue state in `chrome.storage.local` for this Chrome profile.
- Import a CSV with preview and explicit confirmation.
- Add one individually researched prospect from a user-reviewed source without automated page access.
- Gate manual entry and CSV rows by the source toggles selected for the campaign.
- Keep a bounded recent manual source-intake log with source URL, outcome, and review indicators.
- Record research notes by lead using structured categories, a specific observed fact, a user-supplied evidence URL, confidence, and an optional separately labeled opportunity hypothesis.
- Deduplicate identical research notes; show note counts in the lead queue and the latest 12 notes in the evidence log.
- Validate headers and rows; report rejected records and invalid optional fields.
- Deduplicate against campaign leads by normalized Instagram handle, website domain, then business name + location.
- Preserve source evidence on merges, make unchanged imports idempotent, and flag ambiguous/conflicting identities for review.
- Enforce the campaign lead cap and display a lead queue with status/source/review flags.
- Prepare a correction CSV for rejected and over-capacity rows; the user manually clicks the download link.
- Show pause/resume/stop controls.
- Automated tests cover state migration/round-trip, failed writes, import commit idempotency, campaign-cap enforcement, and exception export.
- `npm run verify:extension` validates built Manifest V3 resource paths and runs the compiled service worker against mocked Chrome storage/messaging to exercise the critical workflow paths.

## CSV format

Required header: `businessName` (aliases: `business_name`, `business`, `name`).

Optional headers: `location`, `websiteUrl` (also `website`, `website_url`, `domain`), `instagramUsername` (also `instagram`, `instagram_handle`, `username`), `instagramUrl`, `sourceUrl`, `sourceType`, `notes`.

The parser accepts UTF-8/BOM, quoted commas, escaped quotes and embedded newlines. It caps file size at 2 MB and input at 5,000 rows. Invalid required fields and malformed rows are rejected; invalid optional URLs/handles are flagged for review. Review preview outcomes before confirming import.

## Manual QA

1. Create a campaign and keep **CSV / manual import** enabled in Lead sources.
2. Select a CSV and click **Preview CSV**.
3. Inspect accepted, rejected, duplicate, merged, needs-review and over-capacity rows.
4. If there are rejected or over-capacity rows, click **Prepare rejected / over-capacity CSV**, then click the generated download link to save those rows and their correction reasons.
5. Click **Import accepted rows** to persist the preview result.
6. Re-import the same file; identical records should be reported as duplicates, without increasing the canonical lead count.
7. Close/reopen the side panel and verify the campaign lead queue is still present.
8. Use a campaign with a low target (e.g. 2) and a CSV with more unique records to verify over-capacity rows remain unimported and appear in the exceptions CSV.
9. Check that warning/rejected rows explain what needs review or correction.
10. In **Record an observation**, select a lead, choose a category, enter a factual observation of at least 12 characters, enter the URL you personally reviewed, and set its confidence. Keep any potential opportunity in the separately labelled hypothesis field.
11. Save the note, confirm it appears in **Recent research notes**, and confirm the lead queue shows the research-note count. Try saving the exact same note again; it should not create a duplicate.
12. Try an invalid evidence URL or a lead from another campaign using the worker API harness tests; such notes must be rejected.

The current storage is local to the Chrome profile. Supabase runtime auth/persistence is not connected and there is no cloud sync. Phase 3 source entry records use user-supplied information only; the extension does not fetch or scrape the pages. Source-specific toggles are enforced. CI verifies the build, worker API harness, source intake, and research-note validation/persistence. A real Chrome UI/import/research/panel-reopen test is still required; CI does not prove the live browser UI was manually operated. Source scraping/profile navigation remains disabled. No automated Instagram message sending exists.

## Safety boundaries

The manifest deliberately declares no broad host permissions and no content scripts. Meta/Instagram extraction remains gated pending method-specific review. Google Maps scraping is out of scope. No automated sending or follow-up scheduling is implemented.
