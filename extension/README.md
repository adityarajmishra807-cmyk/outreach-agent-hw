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
- Validate headers and rows; report rejected records and invalid optional fields.
- Deduplicate against campaign leads by normalized Instagram handle, website domain, then business name + location.
- Preserve source evidence on merges, make unchanged imports idempotent, and flag ambiguous/conflicting identities for review.
- Enforce the campaign lead cap and display a lead queue with status/source/review flags.
- Prepare a correction CSV for rejected and over-capacity rows; the user manually clicks the download link.
- Show pause/resume/stop controls.
- Automated tests cover state migration/round-trip, failed writes, import commit idempotency, campaign-cap enforcement, and exceptions export.

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

The current storage is local to the Chrome profile. Supabase runtime auth/persistence is not connected and there is no cloud sync. CI tests cover the pure import-commit transaction and state-store wrapper, but a real Chrome import/panel-reopen test is still required. Source scraping/profile navigation remains disabled. No automated Instagram message sending exists.

## Safety boundaries

The manifest deliberately declares no broad host permissions and no content scripts. Meta/Instagram extraction remains gated pending method-specific review. Google Maps scraping is out of scope. No automated sending or follow-up scheduling is implemented.
