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
- Gemini API: server-side only (planned integration).

## Current status

- [Product Requirements Document](docs/PRD.md)
- [Phase 0 repository and architecture review](docs/PHASE-0-REVIEW.md)
- [Source access matrix](docs/SOURCE-ACCESS-MATRIX.md)
- [Phase 1 foundation progress and manual QA instructions](docs/PHASE-1-FOUNDATION.md)
- [Chrome extension instructions](extension/README.md)

The Phase 1 foundation is complete on `main`: CI passed the manifest-path fix, and the user confirmed the extension loads and campaign controls work in Chrome. See [Phase 1 verification](docs/PHASE-1-FOUNDATION.md) and the [successful CI run](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39463541084).

**Phase 2 — implemented; manual browser acceptance pending.** CSV validation, deduplication, local commit, lead queue, and exception export are implemented and automated-test verified. Real-Chrome acceptance remains open; data is local to the current Chrome profile and is not cloud-synced. See [Phase 2 plan](docs/PHASE-2-PLAN.md).

**Current milestone: Phase 3 — source intake and evidence bundle.** The side panel supports individual lead entry with source gates, a source activity log, structured research notes, evidence-coverage summaries, and a per-lead plain-text research bundle that separates observed notes from items needing verification and opportunity hypotheses. The bundle is a review aid—not independently verified findings, a lead score, or an outreach draft. The extension does not fetch or scrape source pages. CI passed at [run 39669685690](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39669685690): 72 automated tests, type checks, builds, module/resource verification and runtime checks. Real Chrome UI acceptance remains pending. See [Phase 3 plan](docs/PHASE-3-PLAN.md).

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

Use `.env.example` as a list of future environment variables. Keep Gemini and Supabase service credentials only in server-side environment variables. Never commit real keys or ship a privileged key in the extension/client bundle. Review Supabase RLS before applying migrations to a deployed project.

## Branching

The requested workflow is direct commits to `main`; do not create or develop on feature branches. Only `main` is intended for development; the stale `phase-1-foundation` branch has been deleted and verified.
