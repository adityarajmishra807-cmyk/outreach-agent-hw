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

- `extension/`: Chrome Manifest V3 side panel, background worker, and local foundation queue.
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

The foundation scaffold and queue domain logic are implemented on `main`. CI has passed tests, type checking, and builds on the implementation commits reviewed. The latest workflow also uploads a loadable extension artifact; check [GitHub Actions](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions) for its final result.

**Still incomplete:** manual Chrome smoke testing, a committed npm lockfile, CSV ingestion, runtime Supabase integration, Gemini drafting, and source integrations. Phase 1 is not called complete until the latest CI run and manual Chrome QA are complete.

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

The requested workflow is direct commits to `main`; do not create or develop on feature branches. A redundant legacy `phase-1-foundation` branch still needs deletion authorization/cleanup.
