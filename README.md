# Horizon Works Outreach Agent

A human-in-the-loop lead research and Instagram DM drafting assistant.

## Product boundaries

- Create a deduplicated queue of up to 100 business prospects per campaign from permitted or user-provided sources.
- Research business-relevant information and retain evidence for personalization.
- Generate individualized outreach drafts with Gemini through the server-side backend; free-tier quotas and data-use terms apply.
- Persist campaign/lead/draft progress and recover safely from interruptions.
- Use a Chrome Manifest V3 extension for user-controlled browser workflows.
- The agent must **never send Instagram messages automatically**.
- No Meta API integration is planned for the MVP.
- Unreviewed browser/source automation stays disabled. Never bypass access controls, CAPTCHAs, login challenges, or platform safeguards.

## Architecture

- `extension/`: Chrome Manifest V3 side panel, background worker, local queue, CSV import, manually recorded lead sources, and evidence-first research notes.
- `web/`: Next.js dashboard and Vercel API routes.
- `packages/shared/`: campaign/lead/draft types, validation, normalization, and queue state transitions.
- `supabase/migrations/`: initial schema and owner-scoped Row Level Security policies.
- `tests/`: domain and no-send safety tests.
- Gemini API: server-side only. The draft API and editable Draft Studio are implemented but disabled by default until configured.

## Current status

- [Product Requirements Document](docs/PRD.md)
- [Phase 0 repository and architecture review](docs/PHASE-0-REVIEW.md)
- [Source access matrix](docs/SOURCE-ACCESS-MATRIX.md)
- [Phase 1 foundation progress and manual QA instructions](docs/PHASE-1-FOUNDATION.md)
- [Chrome extension instructions](extension/README.md)
- [Phase 4 — Gemini draft generation and access controls](docs/PHASE-4-PLAN.md)

The Phase 1 foundation is complete on `main`: CI passed the manifest-path fix, and the user confirmed the extension loads and campaign controls work in Chrome. See [Phase 1 verification](docs/PHASE-1-FOUNDATION.md) and the [successful CI run](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39463541084).

**Phase 2 — implemented; manual browser acceptance pending.** CSV validation, deduplication, local commit, lead queue, and exception export are implemented and automated-test verified. Real-Chrome acceptance remains open; data is local to the current Chrome profile and is not cloud-synced. See [Phase 2 plan](docs/PHASE-2-PLAN.md).

**Phase 3 — implemented; real Chrome UI acceptance pending.** The extension supports source-aware lead intake, structured research notes, evidence coverage, and a local plain-text research bundle. It does not fetch or scrape source pages. The bundle is user-entered/imported evidence, not independent verification. See [Phase 3 plan](docs/PHASE-3-PLAN.md).

**Current milestone: Phase 4 — server-side Gemini draft generation.** The guarded Next.js endpoint now starts with an 8,192-token output budget and automatically retries a truncated Gemini response once at 16,384 tokens. The Draft Studio supports editable drafts, evidence references, review notes, and manual copying only. Drafts are not saved or sent. The production health endpoint has reported Gemini generation enabled, but a new live generation after the token-budget fix still needs confirmation. The current access-key gate is not full user authentication, so rotate any key exposed in chat and restrict production access. See [Phase 4 plan](docs/PHASE-4-PLAN.md).

## Development

Requires Node.js 22 and npm.

```sh
npm install
npm test
npm run typecheck
npm run build
```

Run the dashboard locally with `npm run dev:web`. The API health endpoint is `/api/health`.

To load the extension after building, open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and choose `extension/dist`.

## Security

Use .env.example as the environment-variable reference. For local web testing, configure the variables in web/.env.local; for Vercel, use the project's server-side environment settings. GEMINI_API_KEY must never be exposed to a client bundle. Keep GEMINI_DRAFTS_ENABLED=false by default outside an explicitly configured environment. A separate DRAFT_STUDIO_ACCESS_KEY is a transitional single-operator gate, not account authentication; restrict the production endpoint and add real authentication plus durable rate limiting before broader use. Rotate any access key exposed in conversation. Review Supabase RLS before applying migrations to a deployed project.

## Branching

The requested workflow is direct commits to `main`; do not create or develop on feature branches. Only `main` is intended for development; the stale `phase-1-foundation` branch has been deleted and verified.
