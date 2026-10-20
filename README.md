# Horizon Works Outreach Agent

A human-in-the-loop lead research and Instagram DM drafting assistant.

## Product boundaries

- Campaign target: up to 100 leads.
- Build one deduplicated prospect queue from permitted/user-assisted sources.
- Generate evidence-backed personalized drafts using Gemini from the server-side backend.
- Persist campaign, lead, and draft state and resume after interruptions.
- The agent must **never send Instagram messages automatically**.
- No Meta API integration is planned for the MVP.
- Unreviewed browser/source automation is disabled. Do not bypass access controls, CAPTCHAs, login challenges, or anti-abuse measures.

## Architecture

- `extension/`: Chrome Manifest V3 side panel and extension worker.
- `web/`: Next.js dashboard and Vercel API routes.
- `packages/shared/`: campaign/lead models, validation, and state transitions.
- `supabase/migrations/`: initial schema and Row Level Security policies.
- `tests/`: domain and safety tests.
- Gemini API: server-side only.

## Development

Requires Node.js 22+ and npm.

```sh
npm install
npm run test
npm run typecheck
npm run build
```

To load the extension: after building, open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select `extension/dist`.

Run the web dashboard locally:

```sh
npm run dev:web
```

The web health endpoint is `/api/health`.

## Current status

- [Product Requirements Document](docs/PRD.md)
- [Phase 0 repository and architecture review](docs/PHASE-0-REVIEW.md)
- [Source access matrix](docs/SOURCE-ACCESS-MATRIX.md)
- [Extension setup](extension/README.md)

**Phase 1 scaffold is in progress on the `phase-1-foundation` branch.** The current extension can create and persist local campaign records and control campaign status. Lead discovery, Supabase runtime integration, and Gemini drafting are not connected yet.

The extension intentionally declares no website host permissions and has no content scripts at this stage. Meta/Instagram automation stays gated. Google Maps scraping is out of scope.

## Environment and security

Use `.env.example` as the variable-name reference. Keep Gemini and Supabase service credentials only in server-side environment variables. Never commit real keys or ship a privileged key in the extension/client bundle. Review Supabase RLS before applying migrations to a deployed project.
