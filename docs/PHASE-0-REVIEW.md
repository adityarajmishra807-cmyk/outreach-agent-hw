# Phase 0 — Repository, Architecture & Source-Access Review

**Project:** Horizon Works AI Lead Research & Instagram Drafting Agent  
**Reviewed:** 20 October 2026  
**Branch:** main  
**Status:** **Complete with source-automation gates**  
**Purpose:** Establish what exists, select the MVP architecture, document source-access decisions, and define the safe implementation boundary before feature code begins.

## Executive outcome

The GitHub repository is a documentation baseline, not an existing extension implementation. No application source, extension manifest, package manifest, test suite, CI pipeline, license file, or deployment configuration was present during this review. There is no legacy behavior to preserve yet.

Proceed to Phase 1 using a Chrome Manifest V3 TypeScript extension, a Next.js application/API deployed on Vercel, Supabase Postgres for durable campaign state, and Gemini through a server-side backend adapter. Build the MVP around user-assisted/imported lead data and permitted website research.

**Important gate:** Automated extraction or batch navigation on Meta/Instagram properties is **disabled by default** until the exact method has been reviewed against current terms and permissions. No Meta API will be integrated. Google Maps scraping will not be implemented. The PRD's source list remains a discovery strategy, not blanket authorization to automate each source.

## 1. Repository inventory

Checked the live repository on GitHub and fetched the current README, PRD, .gitignore, .env.example, root listing, and docs/ listing.

| Area | Finding | Phase 0 decision |
|---|---|---|
| Repository | Public repository, default branch main; write permission is available to the connected GitHub integration | Continue on main for initial docs; use a feature branch for code changes if desired |
| Product specification | docs/PRD.md exists and provides MVP scope, requirements, architecture, data model, tests, and 7 delivery phases (Phase 0–6) | Use as the baseline; update the PRD if implementation requires a product change |
| Runtime source | No extension/, web/, packages/, or supabase/ implementation exists | Greenfield scaffold in Phase 1 |
| Extension | No manifest.json, service worker, content script, side panel, or permissions to audit | Design minimal permissions from scratch; do not claim an existing extension is reusable |
| Build/test | No package.json, lockfile, unit tests, lint config, TypeScript config, or CI workflow exists | Introduce reproducible tooling and baseline tests in Phase 1 |
| Deployment | No Vercel project/configuration or Supabase migration files are present in Git | Deployment and database setup are future dependencies |
| License | No repository LICENSE file was found in the inspected root | Do not assume third-party code is reusable merely because the repository is public; check dependency licenses and decide on a project license before external distribution |
| Environment | .env.example contains placeholders for Gemini and Supabase variables; no secret values are needed in Git | Keep all API/service credentials server-side; never add real .env files to the repository |
| Scope invariant | README and PRD specify draft-only; manual sending; no Meta API | Make the no-send boundary a tested release-blocking invariant |

### Existing files

- README.md — project scope and intended architecture.
- docs/PRD.md — product and technical requirements.
- .gitignore — excludes common build artifacts and environment files.
- .env.example — placeholder configuration variable names only.

## 2. Architecture decisions

### ADR-001 — Split extension and web/backend

**Decision:** One repository with distinct components:

- extension/ — Chrome Manifest V3 + TypeScript, side panel and browser worker.
- web/ — Next.js dashboard and Vercel API routes.
- packages/shared/ — shared types, validation schemas, and state transitions.
- supabase/ — SQL migrations, indexes, and Row Level Security policies.
- docs/ — PRD, phase reviews, operational instructions.
- tests/ — unit/integration/safety regression tests.

The extension handles the user interface and approved browser-side interactions. The web/backend layer runs Gemini calls and validates inputs/outputs. Supabase stores campaign state, source evidence, drafts, state transitions, and recovery checkpoints. The Gemini key and Supabase service-role credential must never be packaged in the extension.

### ADR-002 — Durable state, not service-worker memory

**Decision:** Persist campaign/lead status before beginning each consequential step and after each successful step. Treat Manifest V3 service-worker memory as ephemeral. Operations should be idempotent; resume logic must reconcile an in-progress task before rerunning it.

### ADR-003 — Source adapters have default-deny gates

**Decision:** Each lead source must have its own access method, enabled/disabled flag, source provenance, and documented terms review. An unreviewed source adapter remains disabled and falls back to manual input/import.

### ADR-004 — No-send invariant is structural

**Decision:** Do not implement a Send button handler, DOM selector/click operation for Instagram Send, Enter-to-submit behavior, send scheduler, automated follow-up, or retry logic for sending. The extension can save/edit/copy a draft. “Manually sent” is recorded only after the user explicitly selects the status.

### ADR-005 — Gemini is server-side and conservative

**Decision:** Use an adapter configured with a currently available Gemini model. Check model availability and quota at implementation time. Request only the minimum business-relevant context; validate structured results and require source evidence for specific factual claims. Free/unpaid Gemini API terms permit Google to use inputs and outputs to improve products and allow human review; therefore do not submit sensitive, confidential, private, or unnecessary personal information.

## 3. Source-access decisions

| Source | Phase 0 result | MVP implementation boundary |
|---|---|---|
| Meta Ad Library | **Manual/user-assisted only** unless a particular automated method is explicitly approved | No Meta API. Do not scrape/batch-extract the public UI. User may manually search and submit permitted advertiser URLs or records to the queue. Keep automated collection disabled pending permission/policy review. |
| Instagram discovery/profile review | **User-assisted; automated extraction gated** | Do not batch-navigate or programmatically extract Instagram page data until the exact method is cleared. Initial fallback: user supplies a profile URL/handle and enters/pastes relevant business observations; the agent can research supplied public business URLs and draft from user-supplied/approved evidence. A logged-in session is not itself proof of permission. |
| Google Maps | **No scraper** | Do not build an automated Maps/Maps Platform content extractor or copy/export its content to populate our own persistent lead database. Initial fallback: user import/manual entry or an independently permitted source/provider whose terms allow this use. |
| Business websites | **Conditional, per site/method** | Start from user-supplied or legitimately obtained business URLs. Fetch only where access and reuse are permitted, honor applicable site terms and machine-readable restrictions, use reasonable request limits, preserve source URL and timestamp, and provide a manual paste fallback. Do not crawl arbitrary domains by default. |
| CSV/manual import | **MVP fallback enabled** | User-provided data can seed the queue; validate, normalize, deduplicate, and preserve source attribution where provided. |
| General search/business provider | **Not selected yet** | Choose only after checking permitted access, allowed storage/reuse, coverage, and cost. Do not build a scraper for Google Search result pages as a default strategy. |

Supporting primary references and reviewed implications are in [Source Access Matrix](SOURCE-ACCESS-MATRIX.md).

## 4. Security and operational baseline

- Minimal Chrome host permissions; request optional site access only when needed and explain it in the UI.
- No collection of Instagram passwords, session cookies, authentication tokens, inbox/private-message contents, follower lists, or sensitive personal attributes.
- Gemini key and Supabase service-role key live only in Vercel server environment variables.
- Validate extension-to-backend requests and authenticate the dashboard. Do not expose a privileged service-role key to the client.
- Configure Supabase Row Level Security before storing campaign records in a deployed environment.
- Do not send sensitive/confidential data to the free Gemini tier. Public business information is also minimized to what is required for draft generation.
- On CAPTCHA, login challenge, access denial, restriction warning, or uncertain page identity: stop the affected task, preserve state, and ask the user to resolve the issue normally. Do not bypass it.
- Record stable error codes and task transitions, not secrets or unnecessary raw page content.
- Do not introduce random timing or other features intended to disguise automation or evade enforcement.

## 5. Phase 0 exit criteria

| Criterion | Result |
|---|---|
| Repository inspected; inventory written | **Pass** |
| PRD exists and reviewed against repository state | **Pass** |
| Intended stack identified | **Pass — extension + Next.js/Vercel + Supabase + server-side Gemini** |
| Source method or manual fallback specified for each lead source | **Pass — automatic Meta/Instagram extraction remains gated** |
| Security and no-send invariants reaffirmed | **Pass** |
| Existing source code and permissions audited | **N/A — no application code exists yet** |
| Actual platform permission for automated extraction obtained | **Not obtained / not assumed** |
| Build/test/deploy verified | **Not yet applicable — no application exists** |

**Phase 0 disposition: proceed to Phase 1, with discovery adapters disabled by default until reviewed.** This is an engineering access-control decision, not legal advice or a claim of platform approval.

## 6. Phase 1 entry checklist

1. Add monorepo/package tooling and TypeScript schemas.
2. Add a minimal MV3 side panel with campaign controls and a visible draft-only notice.
3. Create a Next.js dashboard/API skeleton.
4. Add Supabase migrations and Row Level Security policies.
5. Implement campaign and lead state machines, durable queue, dedupe functions, and pause/resume logic.
6. Add a policy module whose default behavior disables unreviewed source adapters and disallows sending.
7. Add unit tests for state transitions, deduplication, source gating, and the no-send invariant.
8. Add setup instructions without real credentials; verify the Gemini and Supabase keys remain server-only.

## 7. References reviewed on 20 October 2026

- Meta Automated Data Collection Terms: https://www.facebook.com/legal/automated_data_collection_terms
- Meta Ad Library public interface: https://www.facebook.com/ads/library/
- Meta Ad Library API information (not to be used in this MVP): https://www.facebook.com/ads/library/api/
- Google Maps Platform Terms: https://cloud.google.com/maps-platform/terms
- Google Terms of Service: https://policies.google.com/terms
- Gemini API Additional Terms: https://ai.google.dev/gemini-api/terms
- Gemini API pricing and data-use table: https://ai.google.dev/gemini-api/docs/pricing
- Chrome extension service worker lifecycle: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Vercel Functions: https://vercel.com/docs/functions

Policies, provider capabilities, and quotas can change. Re-check them before enabling a source or shipping a release. This review is engineering guidance, not legal advice.
