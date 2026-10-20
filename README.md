# Horizon Works Outreach Agent

A human-in-the-loop lead research and Instagram DM drafting assistant.

## Product boundaries

- Discover and merge up to 100 business leads per campaign from permitted sources.
- Research business-relevant information and retain evidence for personalization.
- Generate individualized outreach drafts using the Gemini API; free-tier quotas and data-use terms apply.
- Persist leads, drafts, and progress so interrupted work can resume.
- Use a Chrome Manifest V3 extension for user-controlled browser workflows.
- The agent must **never send Instagram messages automatically**. The user reviews and sends each message manually.
- No Meta API integration is planned for the MVP.
- Browser-based discovery and data collection must be validated against the relevant sites' terms and access restrictions. Do not bypass access controls or anti-abuse measures.

## Intended architecture

- `extension/`: Chrome Manifest V3 UI, task coordinator, and approved browser-side interactions.
- `web/`: Next.js dashboard and Vercel API routes.
- Supabase: persistent campaign, lead, evidence, draft, and activity storage.
- Gemini API: server-side research summarization and draft generation.

## Project status

- [Product Requirements Document](docs/PRD.md)
- [Phase 0 repository and architecture review](docs/PHASE-0-REVIEW.md)
- [Source access matrix and MVP fallbacks](docs/SOURCE-ACCESS-MATRIX.md)

**Phase 0 is complete with source-automation gates.** This repository currently contains documentation and configuration examples; the application scaffold and tests have not yet been implemented.

Automated extraction from Meta/Instagram is disabled by default pending review of the exact method and required permissions. Google Maps scraping is out of scope. The MVP fallback is user-assisted/imported lead data plus permitted business-website research.

## Security

Keep Gemini and Supabase service credentials in server-side environment variables. Never place private API keys in extension assets or client-side code. Configure Supabase Row Level Security before storing production data.
