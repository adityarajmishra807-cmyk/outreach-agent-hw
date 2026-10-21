# Phase 2 — Lead Ingestion and Deduplication Plan

**Branch:** `main` only  
**Status:** In progress — CSV parser, import validation, deduplication, local persistence, worker preview/commit, and lead queue UI are implemented. Chrome acceptance testing remains.  
**Phase 1 prerequisite:** Complete. The user confirmed the packaged extension loads and the campaign controls work.

## Objective

Let a user import a campaign's prospect list from a CSV, validate records before accepting them, normalize business identifiers, prevent duplicate lead rows, preserve source provenance, and review the resulting leads in one campaign queue.

Phase 2 is about **reliable user-provided/imported data**. It does not enable automated scraping or Instagram navigation. Use the existing `csv_import` source type; manually researched website/source rows can be included in the CSV if the user has the right to use that information.

## In scope

1. CSV upload and preview in the extension side panel or a lightweight dashboard workflow.
2. Supported-column mapping and validation with a row-by-row error report.
3. Lead normalization and deduplication within a campaign, without throwing away provenance.
4. A persistent lead collection associated with the campaign, initially local to the extension unless the Supabase runtime is configured and verified.
5. A visible lead list with import counts, lead status, source, and duplicate/review indicators.
6. Safe re-import behavior: importing the same file twice must not create repeated leads.
7. Export of rejected rows or a clear way to correct and re-import them.

## CSV contract (initial version)

Required:
- `businessName` (aliases accepted: `business_name`, `business`, `name`)

Optional:
- `location`
- `websiteUrl` (aliases: `website`, `website_url`, `domain`)
- `instagramUsername` (aliases: `instagram`, `instagram_handle`, `username`)
- `instagramUrl` (alias: `instagram_url`)
- `sourceUrl` (alias: `source_url`)
- `sourceType` (alias: `source_type`; unknown/missing values become `csv_import` for import provenance)
- `notes`

Requirements:
- UTF-8 CSV; quoted fields, commas, embedded newlines, and escaped quote characters must be parsed correctly.
- Header names are matched case-insensitively after trimming and normalizing separators.
- Empty business names are rejected with row numbers.
- URLs/handles are normalized where possible; invalid optional URLs are flagged for review rather than silently trusted.
- Input sizes and row count are capped to avoid UI stalls and denial-of-service. The campaign's target remains 1–100 leads. A CSV may contain more rows than the target, but the accepted canonical lead count for a campaign may not exceed its configured target; overflow rows must be explicitly reported as not imported.

## Normalization and deduplication policy

Apply identity keys in order of confidence:

1. Exact normalized Instagram username (when present).
2. Exact normalized website domain (when present).
3. Exact normalized business name plus normalized location.

Do not merge on a fuzzy name-only match. Similar/ambiguous records should be flagged for user review instead of silently merged.

For a confirmed duplicate:
- Keep one canonical lead ID.
- Merge only non-conflicting useful fields.
- Keep every source attribution record/URL and import event so the user can trace where the lead came from.
- Do not overwrite a verified/corrected field with a lower-confidence value from a later CSV.
- Make import idempotent: re-importing the same record should add no duplicate lead or repeated source observation.

When multiple rows have the same strong identity key but conflicting business identity/location, flag them for review and preserve the incoming data instead of destructive automatic merging.

## Persistence boundary

Phase 1 currently stores campaign and task state in `chrome.storage.local`; Supabase is only an initial migration, not a connected runtime service. Phase 2 implementation must not pretend the data is cloud-synced.

First acceptance implementation may store leads and import metadata in `chrome.storage.local`, following existing versioned-state/migration and safe-write patterns. Keep the persistence interface isolated so a verified Supabase adapter can be introduced later. If local storage quotas or reliability are inadequate, stop and implement the database runtime before committing to the UI behavior—do not lose imported rows silently.

## Proposed work breakdown

### P2.1 — Domain model and import contract
- [x] Add `ImportLeadRow`, `ImportIssue`, `ImportSummary`, and source provenance types in `packages/shared/src/csv-import.ts`.
- [x] Add a CSV parser for quoted commas, doubled quotes, embedded newlines, BOM and CRLF/LF; reject malformed quoting.
- [x] Add header aliases, row validation, URL/handle normalization, warning/review flags, deterministic fingerprints, a 2 MB byte cap and 5,000-row safety cap.
- [x] Unit-test malformed files, duplicate/blank headers, empty names, row-width mismatches, blank-line row numbers, and quoting/newlines.

### P2.2 — Canonical identity and deduplication
- [x] Implement deterministic matching by Instagram handle, website domain, then business name plus location.
- [x] Keep exact duplicate handling separate from ambiguous-candidate review.
- [x] Merge missing fields without dropping source provenance or overwriting populated fields.
- [x] Add a configurable campaign cap, default behavior for a maximum of 100, plus tests for re-import idempotency, invalid handles, conflicting identities and capacity.

### P2.3 — Persistence and worker API
- [x] Add backward-compatible lead/import state to the existing `chrome.storage.local` record.
- [x] Serialize campaign state mutations and enforce campaign association, source selection, status constraints, and the configured campaign cap.
- [x] Add worker messages for CSV preview and confirmed commit, with structured validation/deduplication outcomes and bounded import history.
- [x] Add CSV export for rejected and over-capacity rows with original input columns, status, row number, and correction reason.
- [x] Add persistence/integration tests around extension storage and transactional import behavior in `tests/import-persistence.test.ts` (legacy-state migration, full-state round-trip, failed write, commit/rollback, idempotent re-import, cap enforcement, exception export).

### P2.4 — Import UI and campaign lead queue
- [x] Choose a CSV and preview per-row outcomes before confirming import.
- [x] Show counts for valid/rejected/new/merged/duplicate/review/over-capacity rows and validation notes.
- [x] Display canonical leads with business name, website/handle, source count, status, and review flags.
- [x] Show current lead count against campaign target and report over-capacity rows.
- [ ] Verify local persistence, import confirmation, re-import idempotency, and cap behavior manually in Chrome on the newly packaged build.

### P2.5 — Regression and user acceptance
- [x] Add parser/deduplication tests for malformed files, field normalization, provenance retention, repeated imports, campaign cap, conflicts and no-send safety.
- [x] Keep safety tests that prohibit automated sending and unapproved website/content-script permissions.
- [x] Latest CI passed at [run 39660969945](https://github.com/adityarajmishra807-cmyk/outreach-agent-hw/actions/runs/39660969945): all 50 tests passed, TypeScript checks passed, both builds passed, and the unpacked extension artifact uploaded.
- [ ] Manually verify CSV import, duplicate behavior, row errors, capacity enforcement, and persistence in Chrome before marking Phase 2 complete.

## Acceptance criteria

Phase 2 is complete only when all are true:
- A user can import a CSV without hand-editing JSON or code.
- Import preview explains accepted, rejected, duplicate, ambiguous, and over-capacity rows.
- Accepted leads are visible in the campaign queue and persist after closing/reopening Chrome's panel.
- Re-importing a file is idempotent and does not inflate the canonical lead count.
- Canonical leads preserve every usable source reference; duplicates do not erase provenance.
- Campaign count never exceeds its configured 1–100 accepted-lead target.
- Normalization and deduplication have automated test coverage and CI passes.
- Manual Chrome acceptance checks pass.

## Out of scope

- Meta Ad Library API (not planned).
- Google Maps scraping.
- Automated Instagram profile scraping or access-control circumvention.
- Gemini draft generation (Phase 4).
- Automated sending, follow-up scheduling, auto-following, or any button/keyboard path that sends messages.
- Claiming Supabase cloud sync before auth, runtime client, and RLS have been configured and tested.

## Implementation order

Work on `main` only. Implement P2.1 and P2.2 with tests first, then persistence/worker APIs, then import UI, and finally regression/Chrome acceptance. Avoid mixing Gemini or source-adapter work into this phase.
