# Phase 1 — Foundation Progress

**Branch policy:** All implementation commits are made directly on `main`.  
**Status:** Foundation scaffold implemented; Phase 1 remains pending live Chrome QA.  
**Latest successful CI run:** https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39460918812

## Implemented on main

- NPM workspace structure for the Chrome extension, Next.js application, and shared domain package.
- Minimal Chrome Manifest V3 side panel and service worker. The manifest has no host permissions or content scripts at this stage.
- Campaign setup UI for campaign name, niche, location, service offer, a target of 1–100, source preferences, and a custom-demo flag.
- Campaign persistence in `chrome.storage.local` with validated queued/running/paused/completed/cancelled/failed transitions.
- Persistent queue task model and worker messages for enqueue, status transitions, queue counts, and safe campaign cancellation.
- Idempotent queue enqueue by campaign/lead identity, target-count enforcement, attempt tracking, and safe recovery: an interrupted processing task is moved to review, not blindly replayed.
- Shared types and normalization helpers for campaigns, leads, drafts, business names, Instagram usernames, and website domains.
- Initial Supabase schema for campaigns, leads, source provenance, research observations, drafts, run checkpoints, and activity events, with RLS enabled and owner-scoped policies.
- Next.js dashboard shell and `/api/health` endpoint.
- Unit tests for campaign validation/transitions, queue idempotency/limits/transitions/recovery/cancellation, and identifier normalization.
- Safety regression tests that check the foundation manifest declares no host permissions/content scripts/scripting permission and that no programmatic click or Enter-to-submit path is present.
- GitHub Actions CI for dependency installation, tests, type checking, and extension/dashboard builds. CI is configured for pushes to `main`; a built extension artifact is being added to the workflow.

## Verification

The latest successful CI run passed dependency installation, domain/safety tests, TypeScript checks, extension/dashboard builds, and the extension-artifact upload. The [built Chrome extension ZIP](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39460918812) is available from that run's Artifacts section. Newer changes must pass CI before they are treated as verified.

The CI builds are not a substitute for manually loading the extension in Chrome. We cannot truthfully mark live Chrome QA complete until the built artifact is opened in a real browser and its controls are exercised.

## Not implemented in Phase 1

These are planned for later phases and are not blockers for the foundation scaffold:
- CSV upload/import UI and actual lead ingestion/deduplication (Phase 2).
- Supabase runtime client, authentication, and server-side campaign persistence. The current extension queue remains local to this Chrome profile; the SQL migration is a starting schema only.
- Gemini integration and evidence-grounded message generation (Phase 4).
- Meta Ad Library/Instagram source adapters. Unreviewed automated extraction remains disabled; no Meta API is used.
- Google Maps scraping (out of scope).
- Instagram profile navigation or content extraction (Phase 3 and only after the access method is reviewed).
- Vercel project configuration/deployment.
- A committed npm lockfile; current CI uses npm install. This is recommended hardening for reproducibility, but is not a functional requirement in the PRD.
- Live Chrome installation QA.

## How to test the extension locally

1. Use Node.js 22 and npm in a network-enabled development environment.
2. From the repository root, run `npm install`, then `npm run build --workspace @horizon/extension`.
3. Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `extension/dist`.
4. Open the extension side panel, create a test campaign, confirm it appears after closing/reopening the panel, and test Start/Resume, Pause, and Stop.
5. Confirm no Instagram tab is opened or accessed by this build; source adapters are not connected.
6. Report any Chrome console errors before advancing to Phase 2.

## Phase 1 exit checklist

- [x] Scaffold and campaign model committed on `main`.
- [x] Local campaign persistence and valid status transitions implemented.
- [x] Queue data model, idempotent enqueue, state transitions, recovery policy, and cancellation policy implemented.
- [x] Tests for shared state and no-send baseline added.
- [x] CI reports successful test/typecheck/build on the implementation revisions checked.
- [x] CI, including extension artifact upload, passed for commit `0ca8c05`.
- [ ] Extension is loaded and manually verified in Chrome.
- [ ] Live Chrome smoke test completed.

**Disposition:** Foundation code and CI are complete; Phase 1 is waiting only for the manual Chrome smoke test. A lockfile is recommended follow-up hardening. The absence of live Chrome access is an explicit QA dependency, not a claim of successful manual testing.

## Non-negotiable guardrails

- No Meta API integration.
- No automated Instagram message sending, scheduling, or follow-up.
- No CAPTCHA/login challenge bypass, hidden/private endpoints, token/cookie extraction, or evasion.
- No Google Maps scraping into the persistent lead store.
- Do not submit sensitive or confidential information to the Gemini unpaid/free tier.
