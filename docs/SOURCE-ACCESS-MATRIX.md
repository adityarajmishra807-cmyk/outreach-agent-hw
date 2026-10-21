# Source Access Matrix — Horizon Works Agent

**Review date:** 20 October 2026  
**Purpose:** Turn the PRD's three discovery areas into explicit implementation controls. This is an engineering assessment, not legal advice. Re-review when a source changes its terms or when the implementation method changes.

## Decision summary

No Meta API will be used. Source automation must be off by default. A public page or a user's logged-in session does not by itself authorize automated extraction, bulk collection, or long-term reuse of data.

| Source | Source type | MVP status | Allowed initial workflow | Not allowed by default |
|---|---|---|---|---|
| Meta Ad Library | Meta-operated public search UI | Manual-assisted only | User searches the public interface and supplies the advertiser/page URL plus relevant notes, or imports a permitted data file | DOM scraper, automated pagination/crawling, automated extraction, or Meta Ad Library API |
| Instagram | Logged-in web page | User-assisted; programmatic extraction gated | User supplies a profile URL/handle and business-relevant facts they are entitled to use; extension can organize the record and generate a draft from approved evidence | Batch profile scanning, programmatic page extraction, hidden endpoints, session-token access, private content collection, challenge bypass |
| Google Maps / Maps Platform | Google Maps interfaces and services | No scraper | User-entered/imported leads, or a separate permitted provider whose terms explicitly allow the intended collection and storage | Scraping, exporting/copying Maps content into a persistent lead database, bulk collection via Maps UI or platform data |
| Business-owned websites | Public business domains | Conditional | User-supplied/legitimately sourced URL; fetch only when permitted, use conservative request behavior, capture source URLs and observation dates; manual paste fallback | Unbounded crawler, robots/terms bypass, attempts to reach authentication-only/private content |
| Search/business data provider | Provider not chosen yet | Disabled pending review | Select after checking coverage, terms, storage/reuse rights, cost, and API limits | Assume Google Search result scraping or provider terms allow commercial lead storage without review |
| CSV/manual entry | User-provided records | Enabled | Validate, normalize, deduplicate, retain source/provenance columns | Import data whose collection/use is unauthorized, or collect unnecessary personal/sensitive data |

## Phase 3 implementation status — manual-assisted intake

The extension implements user-entered prospect records for individually reviewed sources. Users provide the business details, URL, and factual notes; the extension does not issue HTTP requests, open source tabs, or extract page content. The selected campaign's source configuration is checked in the shared workflow and again reflected in the UI. CSV rows that declare a source type whose campaign toggle is off are reported as rejected and included in the exceptions export. Source intake events are stored locally with timestamp, source type, URL, outcome, and review details.

This is a workflow convenience, not approval of an automated collection method. Meta/Instagram extraction remains gated, Google Maps scraping remains out of scope, and website fetching/crawling is not enabled.

Phase 3 implementation plan: [docs/PHASE-3-PLAN.md](PHASE-3-PLAN.md).

## Why Meta/Instagram extraction is gated

Meta's Automated Data Collection Terms describe automated/programmatic tools used to navigate, index, access, collect, or retrieve Meta product data and state that express written permission is required for automated data collection. The directly opened policy endpoint redirected to a Meta login wall during this review, so its live full text could not be independently read in the browser session. The policy must be rechecked directly before any browser automation is enabled.

Implementation consequence: the extension must ship with Meta/Instagram automated extraction disabled. No implementation should silently convert a manual workflow into an automated crawler. If the project later obtains permission or identifies an expressly permitted method, record the approval and re-evaluate the design first.

## Google Maps restriction

The current Google Maps Platform Terms state that customers must not export, extract, or scrape Google Maps content for use outside the services; the examples include copying and saving business names, addresses, and user reviews. Therefore, this product must not implement a Google Maps content scraper to populate its own database. Use manual/user-provided records or a separate provider whose license permits storage and reuse. This finding specifically concerns use of Google Maps/Maps Platform content and does not mean all independently sourced business websites are prohibited.

## Gemini free-tier data handling

The Gemini API Additional Terms (effective 23 March 2026) state that inputs and outputs under unpaid services may be used to improve Google products and services; human reviewers may read, annotate, and process input/output. They caution against submitting sensitive, confidential, or personal information. The MVP should therefore:
- send the minimum business-relevant context needed to draft a message;
- exclude credentials, messages/inbox content, personal/sensitive characteristics, and unrelated page content;
- show a configuration note explaining free-tier data handling;
- make the model name configurable and handle quota/model availability failures gracefully.

## Required source-adapter contract

Every adapter must implement these controls before being enabled:

1. Source identifier and documented collection method.
2. Enabled/disabled feature flag, defaulting to disabled unless the method has been reviewed.
3. User-visible explanation of what the adapter will access.
4. Source URL and observation timestamp for every collected lead fact.
5. Data minimization and source-attribution fields.
6. Pause on access denial, login/security challenge, unexpected block, or ambiguous state.
7. No retry loop or evasion mechanism after a platform restriction.
8. Test that disabled adapters do not make external requests or open source tabs.

## Source data fields

Store only what the workflow needs:
- business name and business category;
- website domain and public business URL;
- Instagram handle/profile URL, if user-supplied or otherwise obtained through an approved method;
- source type, source URL, observation timestamp, and source notes;
- business-relevant public observation plus confidence;
- match status and review status.

Do not store passwords, session cookies, access tokens, private messages, follower lists, or sensitive personal attributes. Avoid submitting personal data to free-tier Gemini.

## References checked 20 October 2026

- Meta Automated Data Collection Terms: https://www.facebook.com/legal/automated_data_collection_terms
- Meta Ad Library public interface: https://www.facebook.com/ads/library/
- Meta Ad Library API information (not part of this product): https://www.facebook.com/ads/library/api/
- Google Maps Platform Terms: https://cloud.google.com/maps-platform/terms
- Google Terms of Service: https://policies.google.com/terms
- Gemini API Additional Terms: https://ai.google.dev/gemini-api/terms
- Gemini API pricing/data-use details: https://ai.google.dev/gemini-api/docs/pricing

Provider terms, capabilities, quotas, and legal requirements can change. Check them again before release.
