# Phase 3 — Lead Source Workflows

**Branch:** `main` only  
**Status:** P3.1 source-aware manual intake and P3.5 evidence-first research notes implemented; automated verification pending for the latest research-note changes. Real-Chrome acceptance pending.  
**Phase 2 status:** Implemented and CI-verified; real-Chrome acceptance remains open.

## Objective

Make campaign source settings meaningful and give the operator a consistent workflow for adding individual prospects from user-reviewed evidence. This phase begins with manual-assisted intake. It does not enable any browser scraping or automatic source fetches.

## Scope in this implementation slice

### P3.1 — Source-aware manual intake
- [x] Add one-at-a-time manual prospect entry to the extension side panel.
- [x] Capture business name, location, website, Instagram handle/profile, source URL, source type, and business-relevant research notes.
- [x] Reuse the CSV parser's normalization and validation contract rather than maintaining a second parser.
- [x] Require evidence URLs for Meta Ad Library, Instagram, and business-website manual entries; use the submitted website/profile URL as provenance if the dedicated source URL field is left blank.
- [x] Enforce the source-specific campaign toggle in the shared domain logic and again in the UI's enabled/disabled state.
- [x] Keep source-specific controls manual-only: no page fetch, automated navigation, scraping, content script, or new host permission is introduced.
- [x] Reuse the canonical deduplication rules and campaign lead cap; exact repeats are idempotent and identity conflicts are preserved as review records.

### P3.2 — Source activity and audit trail
- [x] Persist a bounded local source-intake activity log with source type, evidence URL, action, timestamp, review flags, and canonical/candidate lead references.
- [x] Show the latest 12 source intake events for the active campaign.
- [x] Migrate existing Phase 1/2 state by initializing the new activity list when it is absent.
- [x] Preserve source events locally in the same `chrome.storage.local` state record. This is not cloud sync.

### P3.3 — Enforce source access choices during CSV import
- [x] Rows declaring `business_website`, `instagram_manual`, or `meta_ad_library_manual` are rejected when the corresponding campaign source is disabled.
- [x] Rejected source rows are represented in preview, counted as rejected, and exported with a correction reason.
- [x] Keep overall CSV import disabled unless CSV/manual import is enabled for the campaign.

### P3.4 — Regression and validation
- [x] Add domain tests for manual intake normalization, provenance, repeat idempotency, disabled-source gates, source evidence requirements, campaign capacity, conflicting identity review, invalid optional URLs, terminal campaigns, and legacy-state migration.
- [x] Add a regression test preventing CSV source-type settings from being bypassed.
- [x] Extend the compiled service-worker harness to verify manual lead creation, source evidence, idempotency, and disabled-source rejection.
- [x] CI passed at [run 39665750593](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39665750593), including tests, type checks, extension/dashboard builds, manifest/resource verification, and compiled-worker runtime checks.
- [ ] Run the side panel in a real Chrome profile when available; browser UI acceptance has not been performed by this environment.

### P3.5 — Evidence-first research notes
- [x] Add structured observation categories for services, website experience, contact path, booking/purchase flow, public content, and other factual observations.
- [x] Require a specific observation and a valid HTTP/HTTPS evidence URL; reject URLs containing credentials and normalize away fragments.
- [x] Store a potential opportunity as a separately labelled hypothesis, not as an observed fact.
- [x] Record a confidence state: directly observed or needs verification.
- [x] Persist notes locally by campaign and lead, deduplicate exact repeats, and keep a recent evidence log in the side panel.
- [x] Show note counts in the campaign lead queue and keep the evidence URL visible for user review.
- [x] Add validation tests for evidence URLs, required facts, lead ownership, confidence/category enums, duplicate records, terminal campaigns, and legacy-state migration.
- [x] Extend local-state persistence coverage and the compiled-worker runtime harness for note creation, deduplication, and restart persistence.
- [ ] Confirm the current commit passes all CI checks.
- [ ] Run the side panel in real Chrome when available; the environment has not completed a real-profile UI test.

## Explicitly not enabled

- Meta Ad Library automated collection or API.
- Instagram profile scanning/extraction, hidden endpoints, login challenges, or access-control circumvention.
- Google Maps scraping or bulk collection.
- Unreviewed website fetching, crawling, or robots/terms bypass.
- Gemini draft generation or Supabase cloud persistence.
- Automated Instagram messaging, automated follow-ups, auto-following, or programmatic send/submit actions.

## Design constraints

1. The source URL and notes are supplied by the user; the extension does not assert that the source contents were independently verified.
2. Invalid optional URLs/handles are retained only as review flags, not trusted canonical URLs.
3. No private messages, credentials, session cookies, tokens, or sensitive personal data should be entered.
4. Source activity history is bounded to 500 most recent events in local extension storage.
5. Continue direct commits to `main` only.

## Next slice after this one

After research-note UI acceptance, Phase 3 can add evidence-aware qualification summaries that draw only from the user's recorded observations, clearly distinguish facts from hypotheses, and flag missing/uncertain evidence. Do not add automatic HTTP fetches until the specific collection method and applicable access rules are reviewed. After source workflows are reliable, proceed to server-side Gemini draft generation and only then consider Supabase runtime persistence/authentication.
