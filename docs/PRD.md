# Horizon Works Outreach Agent — Product Requirements

**Version:** 1.0  
**Status:** Initial specification  
**Repository:** `adityarajmishra807-cmyk/outreach-agent-hw`

## 1. Product summary

Build a Chrome browser companion and web dashboard to help Horizon Works discover relevant business prospects, review available business evidence, and prepare personalized outreach drafts. The product is human-in-the-loop: it must not send Instagram messages.

## 2. Goals

1. Create a deduplicated list of up to 100 leads per campaign.
2. Support discovery from permitted Meta Ad Library access, Instagram discovery where permitted, and Google Maps/business websites through permitted sources.
3. Match leads with Instagram handles where reliable.
4. Create evidence-grounded, individualized DM drafts.
5. Save all work and resume after interruption.
6. Let the user edit, copy, and manually send drafts.
7. Maintain clear source attribution and task status.

## 3. Non-goals

- Automated sending or scheduling of Instagram DMs.
- Meta API integration for Instagram automation.
- Bypassing CAPTCHAs, rate limits, login challenges, or other safeguards.
- Fabricating website issues or business details.
- Collecting private information or credentials.
- Guaranteeing that any browser automation is permitted simply because it uses a logged-in session.

## 4. Target user and primary job

**User:** Horizon Works operator conducting business outreach.

**Job to be done:** Given a niche, location, service, and target count, create a trustworthy, prioritized queue of businesses with research notes and ready-to-review, personalized DM drafts.

## 5. Primary workflow

1. Create campaign: niche, geography, offered service, target count (maximum 100), tone, and optional qualification criteria.
2. Discover candidate businesses from permitted sources.
3. Normalize identities and deduplicate candidates.
4. Display source evidence and confidence; user can exclude leads.
5. Match an Instagram account where a reliable handle is available.
6. Inspect information accessible through approved means; do not bypass access barriers.
7. Provide evidence and context to Gemini through a server-side API route.
8. Validate generated draft against schema and evidence.
9. Save lead, evidence, draft, and status.
10. Show draft in dashboard/extension; user can edit or copy it.
11. User manually sends the message in Instagram, then records a contacted status. No automated send action exists in the codebase.
12. Resume pending work from persisted checkpoints after failures.

## 6. Lead sources and access policy

### Meta Ad Library
- Use public/approved search or another permitted access method.
- Store advertiser/page identity, observed ad evidence, source URL, and observation timestamp when available.
- Do not imply access to ad spend or performance metrics unless explicitly available from the source.
- Automated collection is disabled until its method is checked against current terms and technical access rules.

### Instagram
- User's existing login may be used for ordinary user-led inspection.
- Extension automation must not bypass access controls, login checkpoints, rate limits, CAPTCHAs, or anti-abuse systems.
- Do not implement stealth, fingerprint spoofing, proxy rotation, or evasion.
- Enable browser-assisted navigation/data extraction only after validating applicable terms and access permissions. When not permitted, use manually supplied links/data or a user-operated workflow.

### Google Maps and business websites
- Use sources and collection methods permitted by their respective terms.
- Preserve canonical URL, source type, and observation date.
- No scraping method is assumed authorized by default.

Every source adapter must document the allowed access method and have a clear disabled state if that method has not been approved.

## 7. Functional requirements

### FR-1 Campaign setup
- User can specify niche, location, service, maximum leads (1–100), and campaign name.
- Invalid or empty required fields produce actionable validation errors.

### FR-2 Lead discovery
- Each lead records business name, location (when available), website, Instagram handle/profile URL (if verified), source, source URL, source evidence, and first-seen time.
- Partial leads are allowed but must be marked incomplete.
- Each adapter can be enabled/disabled independently.

### FR-3 Deduplication
- Normalize domains, handles, phone numbers where present, and business names/locations.
- Merge exact identifiers automatically.
- Ambiguous matches are flagged for user review rather than silently merged.
- Preserve all source observations after merging.

### FR-4 Qualification and prioritization
- Prioritize fit with campaign niche/service and verifiable evidence of a relevant opportunity.
- Active-advertiser evidence can be a positive signal, not proof that the business needs a website.
- Show reasons behind scores; do not invent spend, intent, budget, or business issues.

### FR-5 Instagram identity matching
- Track matching status: `unmatched`, `candidate`, `verified`, `rejected`.
- Require evidence before marking a handle verified.
- User review is required for ambiguous matches.

### FR-6 Research
- Store brief factual observations and evidence URLs/snippets where permitted.
- Separate verified observations from hypotheses.
- If evidence is insufficient, the system must label it as insufficient and avoid unsupported personalization.

### FR-7 Draft generation
- Generate one message draft for each qualified lead.
- Draft should follow: specific observation (only if supported), potential opportunity, relevant Horizon Works service, low-pressure call to action.
- Mention a custom demo only when configured as an actually available offer; never imply a demo exists if it has not been created.
- Avoid generic flattery, false claims, fabricated findings, and deceptive urgency.
- Return structured JSON validated against a server-defined schema.
- Store model, prompt/template version, and generation timestamp for traceability.

### FR-8 Draft review
- User can view, edit, regenerate, copy, and mark a draft as approved for manual use.
- Draft status and last edit time are persistent.
- Regeneration never overwrites a user-edited draft without confirmation.

### FR-9 Strict manual-send invariant
- No function, content script, background worker, API route, keyboard shortcut, or UI action may click Send or submit an Instagram message.
- The extension may present/copy a draft and open a user-requested profile.
- The user performs the final send in Instagram themselves.
- The UI must label the status as “Draft ready” until the user explicitly records that they sent it.
- Automated tests must assert no send routine or send selector is present.

### FR-10 Queue and recovery
- Persist status after every completed step.
- Suggested states: `discovered`, `deduplicated`, `needs_identity_review`, `research_pending`, `researching`, `research_complete`, `draft_pending`, `drafting`, `draft_ready`, `manually_contacted`, `skipped`, `failed`.
- Use bounded retries only for transient failures.
- Never retry a user action that may have an external side effect without verifying state; in this product the extension itself does not send.
- Stop/pause must take effect before beginning another lead.
- Resume must not duplicate saved records or drafts.

### FR-11 Error handling
- Login checkpoint, CAPTCHA, restriction warning, access denial, or uncertain page identity => pause relevant browser activity and request user intervention.
- Do not automate challenge-solving or attempt to evade a restriction.
- Store actionable error code/message without sensitive page contents.

### FR-12 Campaign dashboard
- Display total leads, researched leads, drafts ready, manual-contact status, skipped leads, and errors.
- Filter by source, state, priority, and draft readiness.
- Export campaign data to CSV.
- Provide per-lead detail panel with source evidence, research notes, draft editor, and audit timeline.

## 8. User experience

Primary screens:
1. Campaign setup.
2. Lead discovery and qualification.
3. Campaign queue/progress.
4. Lead details and evidence.
5. Draft editor/review.
6. Settings and source-access controls.

Key controls: Start, Pause, Resume, Cancel campaign, Skip lead, Edit draft, Copy draft, Mark manually contacted, Export CSV.

The extension must make the manual-send boundary clear and must not display a misleading “Sent” status based only on opening or copying a draft.

## 9. Architecture

- **Chrome extension:** Manifest V3, TypeScript, side panel or popup, background service worker, explicit permissions, content scripts only for approved browser interactions.
- **Web app:** Next.js deployed on Vercel.
- **Server endpoints:** authenticated campaign/lead operations and Gemini draft generation.
- **Database:** Supabase Postgres with row-level security and server-side service credentials.
- **AI:** Gemini API called only from the backend.
- **Source adapters:** isolated modules with method-specific access validation and kill switches.

Suggested repository layout:
```
extension/
  manifest.json
  src/background/
  src/content/
  src/sidepanel/
  src/lib/
web/
  app/
  app/api/
  lib/
packages/
  shared/
supabase/
  migrations/
docs/
  PRD.md
tests/
```

## 10. Data model

### campaigns
- id, name, niche, location, service_offer, target_count, status, settings JSON, created_at, updated_at

### leads
- id, campaign_id, business_name, normalized_name, location, website_url, instagram_handle, instagram_url, identity_status, priority_score, current_status, created_at, updated_at

### lead_sources
- id, lead_id, source_type, source_url, observed_at, evidence JSON, access_method, confidence

### research_notes
- id, lead_id, note_type, content, evidence_refs JSON, confidence, created_at

### drafts
- id, lead_id, content, status, model_id, prompt_version, generation_metadata JSON, edited_at, created_at

### task_events
- id, campaign_id, lead_id, event_type, status, message, metadata JSON, created_at

### deduplication
- preserve canonical lead ID and merge history so source evidence is never lost.

Use UUIDs, foreign keys, indexes on campaign/status and normalized identifiers, and timestamps. Enforce uniqueness where an exact canonical identity can safely be determined.

## 11. API outline

- `POST /api/campaigns` — validate and create campaign.
- `GET /api/campaigns/:id` — retrieve campaign summary.
- `POST /api/campaigns/:id/discovery-jobs` — initiate an allowed source adapter.
- `POST /api/leads` — insert/upsert normalized leads.
- `PATCH /api/leads/:id` — update verified fields/status.
- `POST /api/leads/:id/research` — analyze supplied/approved evidence.
- `POST /api/leads/:id/drafts` — generate a draft through Gemini.
- `PATCH /api/drafts/:id` — save user edits/status.
- `POST /api/campaigns/:id/pause` and `resume` — control queue.
- `GET /api/campaigns/:id/export` — authorized CSV export.

Validate inputs, authenticate requests, enforce ownership at the database layer, rate-limit model calls, and return structured error codes. Do not expose service-role keys or Gemini keys to the extension/browser.

## 12. Security and privacy
- Store API keys only in Vercel environment variables.
- Use Supabase Row Level Security and least privilege.
- Never collect or store Instagram passwords/session cookies.
- Do not transmit unnecessary personal data to the AI model.
- Avoid storing whole profile pages/screenshots unless needed and permitted.
- Make campaign deletion and export explicit.
- Log operational metadata, not secrets or authentication tokens.
- Validate and sanitize all model output before rendering.

## 13. Non-functional requirements
- Resume processing after refresh/browser restart without losing saved leads/drafts.
- Duplicate upserts are idempotent.
- Visible state updates for each lead.
- Bounded retry/backoff and clear errors.
- Responsive dashboard suitable for desktop.
- No API keys in client bundles.
- User can pause/cancel processing.
- Campaign target never exceeds 100 leads in the initial release.

## 14. Acceptance criteria

1. User can create a campaign with target count 1–100.
2. Supported source adapters return normalized lead records and source evidence.
3. Repeated sources for the same business merge without losing source observations.
4. Ambiguous businesses are not automatically merged.
5. A draft can only include business-specific claims supported by attached evidence; missing evidence triggers neutral copy or review.
6. Drafts remain saved after browser and dashboard restart.
7. A Gemini quota/API error does not lose the lead record or previously saved drafts.
8. Pause stops new work; resume continues pending states.
9. Login/security challenges cause a pause and user prompt, not circumvention.
10. Extension cannot send a message: no send handler, send selector, or programmatic submit path exists; tests verify this invariant.
11. Copy/edit/mark-manually-contacted are distinct actions with distinct statuses.
12. Secret scanning/build checks confirm no credentials are committed or bundled.
13. Source adapters remain disabled until their access method is reviewed and approved.
14. CSV export includes source provenance and draft status but excludes secrets/session data.

## 15. Test plan

- Unit: URL/domain/handle normalization, dedup logic, confidence labels, state transitions, schema validation.
- Integration: campaign and lead persistence, Gemini mocked success/failure, retry/idempotency behavior, database access controls.
- Extension: permission boundaries, content script messaging, service-worker restarts, pause/resume.
- Safety regression: verify no automated send capability exists; confirm challenge/restriction states pause.
- Manual QA: small sample with user-reviewed business identities and drafts before expanding to 100.

## 16. Delivery phases

### Phase 0 — Repository foundation
Set up TypeScript/tooling, shared schemas, environment validation, linting, tests, and docs.

### Phase 1 — Campaign and lead queue
Implement campaign UI/API, normalized lead model, deduplication, Supabase persistence, CSV import/export, and resumable status.

### Phase 2 — Gemini draft generation
Implement server-side Gemini client, schemas, evidence-grounded prompting, edit/copy UI, and quota/error handling.

### Phase 3 — Source adapters
Implement only source integrations whose access methods and terms have been reviewed. Start with manual CSV/import or other clearly permitted sources. Add explicit adapter flags and source evidence.

### Phase 4 — Chrome extension
Add Manifest V3 side panel, task controls, authorized navigation/inspection where permitted, draft presentation, and persistent coordination. No sending automation.

### Phase 5 — Quality and deployment
Automated tests, security review, Vercel deployment, Supabase migrations/RLS review, setup instructions, and small-campaign QA.

## 17. Risks and mitigations

- **Website DOM changes:** detect known page states; pause when selectors or page identity are uncertain.
- **Platform restrictions:** review source access methods; stop on challenges/restrictions; never evade controls.
- **False personalization:** evidence references, confidence fields, and conservative fallback drafts.
- **Duplicates:** canonical identifiers, merge review for ambiguous matches.
- **Worker suspension:** persist checkpoints and use idempotent queue transitions.
- **Gemini free-tier limits:** bounded concurrency, quota/error reporting, caching, and resume later.
- **Credential leakage:** server-only secrets and secret scanning.
- **Source data drift:** store observed timestamp and canonical source URLs.

## 18. Open implementation dependencies

- Confirm applicable terms/access rules for each automated source method before enabling it.
- Configure Gemini API key in Vercel environment.
- Configure Supabase project, database migration, and RLS policies.
- Determine whether an existing extension codebase will be imported; current repository began empty.
- Confirm exact source query methods for Meta Ad Library and Google Maps/business websites before implementation.

## 19. Definition of done for MVP

A user can create a campaign, import or obtain leads through enabled and permitted sources, deduplicate and inspect them, generate evidence-grounded personalized drafts using server-side Gemini, edit/copy them, track manual outreach, and resume the queue after interruption. No Instagram message can be sent by the agent.
