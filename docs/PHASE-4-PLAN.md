# Phase 4 — Server-Side Gemini Draft Generation

**Branch:** main only  
**Status:** First implementation slice committed and CI-verified at [run 39671390662](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39671390662): 84 tests across 8 test files, type checks, both builds, and extension runtime/resource checks passed. A live Gemini API call, private deployment configuration, and real browser acceptance remain unverified.

## Objective

Generate editable, evidence-grounded outreach drafts from the user's research evidence bundle. Keep the Gemini API key server-side and preserve the product's manual-send invariant.

## Implemented in this slice

- [x] Add a Next.js Node.js API route at POST /api/drafts/generate.
- [x] Use Gemini's server REST generateContent endpoint with a model configurable through GEMINI_MODEL; no API key is shipped to the browser or extension.
- [x] Require GEMINI_DRAFTS_ENABLED=true before the endpoint can run. The feature is disabled by default.
- [x] Require a separate DRAFT_STUDIO_ACCESS_KEY of at least 24 characters; the operator enters it into the UI for each page session. It is not stored in local storage.
- [x] Validate that requests contain a full Horizon Works research evidence bundle and a supported tone. Bound request and bundle sizes.
- [x] Treat the bundle as untrusted data in the prompt and instruct the model not to obey embedded instructions or invent business-specific claims.
- [x] Request structured JSON and validate draft size, allowed fields, review notes, and evidence references.
- [x] Reject model citations that do not normalize to a URL already present in the supplied bundle.
- [x] Map disabled configuration, access denial, bad requests, timeout, invalid output, Gemini quota/rate limit, and upstream errors to structured messages without returning upstream response bodies or secrets.
- [x] Add a best-effort per-process request limiter and same-origin request check. These are additional safeguards, not a substitute for durable rate limiting and user authentication.
- [x] Add a web Draft Studio UI: paste a bundle, choose tone, generate an editable draft, see evidence references and review notes, and copy the edited text manually.
- [x] Mark the generated output as needs_review, saved false, and requiresManualReview true.
- [x] Update /api/health to report configuration status without returning credentials.
- [x] Add tests for bundle validation, prompt-injection handling, citation validation, URL prohibition in draft text, access/config gates, origin checking, quota mapping, timeouts, and oversized requests.

## Security and release gates still open

- [x] CI passed on the implementation code: 84 tests across 8 test files, type checks, extension/dashboard builds, and extension runtime/resource verification ([run 39671390662](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39671390662)).
- [ ] Confirm CI passes on the final documentation commit.
- [ ] Configure GEMINI_API_KEY, GEMINI_MODEL, DRAFT_STUDIO_ACCESS_KEY, and GEMINI_DRAFTS_ENABLED only in the server environment.
- [ ] Before enabling this endpoint on a public Vercel deployment, put it behind a real authenticated user/session system and durable edge or shared-store rate limiting. The shared access key and in-memory limiter are a transitional single-operator gate, not multi-user authentication.
- [ ] Review Gemini free-tier data handling and ensure only business-relevant, non-sensitive evidence is submitted.
- [ ] Run the Draft Studio in a real browser with a test bundle, then verify editing/copying, bad key, disabled mode, and quota errors.
- [ ] Confirm no generated draft is persisted across refreshes unless a later authenticated persistence slice is deliberately implemented.
- [ ] Review model output manually before outreach. The server cannot semantically prove every factual claim is correct.

## Environment configuration

Use .env.example as the variable-name reference. The server uses Google's generateContent REST endpoint and JSON response schema as documented at https://ai.google.dev/api/generate-content and https://ai.google.dev/gemini-api/docs/structured-output. For local testing, create a long random value for DRAFT_STUDIO_ACCESS_KEY and keep it out of source control. Keep GEMINI_DRAFTS_ENABLED=false until the intended deployment is access-protected. A model ID can be set through GEMINI_MODEL; the default is gemini-3.8-flash and should be changed if Google's supported model list changes.

## Not included

- Automatic Instagram sending, follow-up scheduling, or programmatic send/submit paths.
- Website fetching, browser scraping, Meta API access, or Google Maps scraping.
- Persisting drafts to Supabase or any other database.
- Multi-user authentication, saved draft history, or campaign ownership.
- Automatic verification of source claims.

## Next slice

After API and browser acceptance, add authenticated draft persistence/editing tied to the user's campaign and lead, preferably alongside the Supabase runtime/auth implementation and row-level security. Do not save AI output under an anonymous shared identity.
