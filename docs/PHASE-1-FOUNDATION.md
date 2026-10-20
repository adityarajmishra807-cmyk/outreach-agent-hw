# Phase 1 — Foundation Progress

**Branch:** `phase-1-foundation`  
**Status:** Foundation scaffold created; Phase 1 is still in progress.  
**CI:** The latest workflow run completed successfully: https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39457756146

## Implemented in this scaffold

- NPM workspace structure for the Chrome extension, Next.js app, and shared domain package.
- Manifest V3 extension side panel and service worker.
- Campaign setup fields for niche, location, service offer, target count (1–100), source selections, and a custom-demo flag.
- Campaign records stored in `chrome.storage.local`; queued, running, paused, and cancelled transitions are validated.
- Shared campaign/lead/draft domain types and normalization helpers.
- Initial Supabase schema with campaign, lead, source evidence, research observation, draft, agent run, and activity-event tables. Row Level Security is enabled with owner-scoped policies.
- Next.js dashboard shell and `/api/health` endpoint.
- Unit tests for campaign configuration, campaign state transitions, and identifier normalization.
- Safety regression tests asserting that this foundation manifest declares no host permissions, content scripts, or scripting permission, and that no programmatic click/Enter-to-submit path exists.
- GitHub Actions CI for install, tests, type checking, and builds.

## Verification

The latest CI job passed:
- dependency installation;
- domain and safety tests;
- TypeScript checks for the shared package, extension, and web workspace;
- Vite extension build;
- Next.js dashboard build.

This is CI verification, not a claim that the extension has been loaded and manually tested in a live Chrome session.

## Not implemented yet

- Supabase client/authentication and server-side campaign persistence.
- CSV upload/import UI and actual lead ingestion/deduplication in the app.
- Source adapters; Meta/Instagram automation remains disabled/gated, and Google Maps scraping is out of scope.
- Gemini backend integration, research evidence pipeline, draft generation/validation and editing.
- Chrome tab navigation/profile inspection; current manifest has deliberately no host permissions or content scripts.
- Extension-to-web API authentication, deployed Vercel project configuration, and applied Supabase migration.
- Lockfile generation/commit for reproducible dependency installation.
- Live Chrome manual QA and an end-to-end campaign test.

## Next implementation slice

1. Generate and commit `package-lock.json` from a clean install.
2. Implement CSV import, lead normalization/deduplication, and persistent lead queue.
3. Integrate Supabase with authentication and verify Row Level Security.
4. Keep all external source adapters disabled until their exact access methods are reviewed.
5. Add Gemini drafting after evidence and storage flow are stable.
6. Perform live Chrome QA before claiming Phase 1 is complete.

## Non-negotiable guardrails

- No Meta API integration.
- No automated Instagram message sending, scheduling, or follow-up.
- No CAPTCHA/login challenge bypass, hidden/private endpoints, token/cookie extraction, or evasion behavior.
- No scraping of Google Maps content into our own persistent lead store.
- Do not send sensitive or confidential information to the Gemini unpaid/free tier.
