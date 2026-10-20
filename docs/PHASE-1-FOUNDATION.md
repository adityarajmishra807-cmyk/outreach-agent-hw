# Phase 1 — Foundation (Complete)

**Branch policy:** All implementation commits are made directly on `main`.  
**Status:** Complete — foundation CI passed and the user confirmed the live Chrome smoke test passed.  
**Latest manifest-fix CI run:** https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39463541084

## Delivered

- NPM workspace structure for the Chrome extension, Next.js application, and shared domain package.
- Chrome Manifest V3 side panel and service worker.
- Campaign setup UI for campaign name, niche, location, service offer, target (1–100), source preferences, and custom-demo flag.
- Campaign persistence in `chrome.storage.local` with validated state transitions.
- Queue-task model and worker messages for enqueue, task status transitions, queue counts, and safe cancellation.
- Idempotent enqueue by campaign/lead identity, target-count enforcement, bounded attempts, and safe recovery of interrupted tasks into review.
- Shared types and validation/normalization helpers for campaigns, leads, drafts, business names, Instagram usernames, and domains.
- Initial Supabase schema with owner-scoped Row Level Security policies.
- Next.js dashboard shell and `/api/health` endpoint.
- Unit coverage for campaign validation/transitions, queue behavior, recovery, cancellation, retries, and normalization.
- Safety regression tests for the no-send baseline and absence of broad website permissions/content scripts.
- GitHub Actions CI for tests, type checks, extension/dashboard builds, and extension artifact packaging.
- Fixed the manifest side-panel path to match Vite's built output at `src/sidepanel.html`.

## Verification

- CI passed for the manifest-path fix at commit `fff183f`, including dependency installation, domain/safety tests, TypeScript checks, both builds, and extension-artifact upload.
- The user confirmed they loaded the fixed extension and completed the Chrome campaign/persistence/control checks.
- The user also confirmed the browser checks are complete; the smoke-test acceptance item is therefore recorded as passed.

The manual QA result is based on the user's confirmation. No claim is made that this environment directly controlled the user's local Chrome session.

## Phase 1 exit checklist

- [x] Scaffold and campaign model committed on `main`.
- [x] Local campaign persistence and valid status transitions implemented.
- [x] Queue data model, idempotent enqueue, recovery and cancellation policies implemented.
- [x] Unit and safety regression tests added.
- [x] CI tests, type checks, builds and artifact upload pass.
- [x] Manifest side-panel path matches the build output.
- [x] User-confirmed Chrome smoke test: extension loads; campaign creation, persistence, and Start/Resume, Pause, Stop controls work.

**Disposition:** Phase 1 is complete. Proceed to Phase 2: CSV lead ingestion, normalization, deduplication, source attribution, and a visible campaign lead queue.

## Remaining product work (later phases)

- CSV lead ingestion and deduplication (Phase 2).
- Runtime Supabase/authentication and server-side campaign persistence.
- Profile/browser workflow only through access methods reviewed and permitted (Phase 3).
- Server-side Gemini integration and evidence-grounded draft generation (Phase 4).
- Draft review, copy/manual-contact tracking and export (Phase 5).
- Pilot, security review and release readiness (Phase 6).

## Non-negotiable guardrails

- No Meta API integration.
- No automated Instagram message sending, scheduling, or follow-up.
- No CAPTCHA/login challenge bypass, hidden/private endpoints, token/cookie extraction, or evasion.
- No Google Maps scraping into the persistent lead store.
- Do not submit sensitive or confidential information to the Gemini unpaid/free tier.
