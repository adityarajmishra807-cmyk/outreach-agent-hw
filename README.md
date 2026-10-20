# Horizon Works Outreach Agent

A human-in-the-loop lead research and Instagram DM drafting assistant.

## Product boundaries

- Discover and merge up to 100 business leads per campaign from permitted sources.
- Research publicly available business information and maintain evidence for personalization.
- Generate personalized draft messages using the Gemini API (free tier subject to its current quotas).
- Persist leads, drafts, and progress so interrupted work can resume.
- Use a Chrome Manifest V3 extension for user-controlled browser workflows.
- The agent must **never send Instagram messages automatically**. The user reviews and sends each message manually.
- No Meta API integration is planned for Instagram automation.
- Browser-based discovery and data collection must be validated against the relevant sites' terms and access restrictions. Do not bypass access controls or anti-abuse measures.

## Intended architecture

- `extension/`: Chrome Manifest V3 UI, task coordinator, and browser-side interactions.
- `web/`: Next.js dashboard and Vercel API routes.
- Supabase: persistent campaign, lead, draft, and event storage.
- Gemini API: server-side research summarization and draft generation.

## Development status

Repository initialized with project scope. Implementation and automated tests are not yet present.

## Security

Keep Gemini and database service credentials in server-side environment variables. Never place private API keys in extension assets or client-side code.
