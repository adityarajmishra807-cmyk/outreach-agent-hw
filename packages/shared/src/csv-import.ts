import {
  normalizeBusinessName,
  normalizeInstagramUsername,
  normalizeWebsiteDomain,
  type LeadSource
} from "./index";

export const MAX_CSV_BYTES = 2 * 1024 * 1024;
export const MAX_CSV_ROWS = 5_000;

export type ImportIssueSeverity = "error" | "warning";

export interface ImportIssue {
  code: string;
  message: string;
  severity: ImportIssueSeverity;
  rowNumber?: number;
  field?: string;
}

export interface LeadSourceProvenance {
  sourceType: LeadSource;
  sourceUrl?: string;
  rowNumber: number;
  importFingerprint: string;
}

export interface ImportLeadRow {
  rowNumber: number;
  businessName: string;
  normalizedName: string;
  location?: string;
  websiteUrl?: string;
  websiteDomain?: string;
  instagramUsername?: string;
  instagramUrl?: string;
  notes?: string;
  sourceType: LeadSource;
  provenance: LeadSourceProvenance;
  reviewFlags: string[];
  rawFields: Record<string, string>;
  importFingerprint: string;
}

export interface RejectedImportRow {
  rowNumber: number;
  rawFields: Record<string, string>;
  issues: ImportIssue[];
}

export interface ImportSummary {
  headers: string[];
  rows: ImportLeadRow[];
  rejectedRows: RejectedImportRow[];
  issues: ImportIssue[];
  totalRows: number;
  acceptedCount: number;
  rejectedCount: number;
  warningCount: number;
}

export interface ParseLeadCsvOptions {
  maxBytes?: number;
  maxRows?: number;
}

interface ParsedCsvRecords {
  records: string[][];
  issue?: ImportIssue;
}

const HEADER_ALIASES: Record<string, string> = {
  businessname: "businessName",
  business_name: "businessName",
  business: "businessName",
  name: "businessName",
  location: "location",
  websiteurl: "websiteUrl",
  website_url: "websiteUrl",
  website: "websiteUrl",
  domain: "websiteUrl",
  instagramusername: "instagramUsername",
  instagram_username: "instagramUsername",
  instagramhandle: "instagramUsername",
  instagram_handle: "instagramUsername",
  instagram: "instagramUsername",
  username: "instagramUsername",
  instagramurl: "instagramUrl",
  instagram_url: "instagramUrl",
  sourceurl: "sourceUrl",
  source_url: "sourceUrl",
  sourcetype: "sourceType",
  source_type: "sourceType",
  notes: "notes"
};

const VALID_SOURCE_TYPES = new Set<LeadSource>([
  "meta_ad_library_manual",
  "instagram_manual",
  "business_website",
  "google_maps_manual",
  "csv_import",
  "other_permitted_source"
]);

function blankSummary(headers: string[] = [], issues: ImportIssue[] = [], totalRows = 0): ImportSummary {
  return {
    headers,
    rows: [],
    rejectedRows: [],
    issues,
    totalRows,
    acceptedCount: 0,
    rejectedCount: 0,
    warningCount: issues.filter((issue) => issue.severity === "warning").length
  };
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isBlankRecord(record: string[]): boolean {
  return record.every((cell) => cell.trim() === "");
}

/**
 * A small RFC-4180-style CSV record parser. It supports commas and line breaks
 * inside quoted fields, escaped double quotes, LF/CRLF input, and BOM-prefixed
 * UTF-8 text. It deliberately fails closed on invalid quote placement.
 */
function parseCsvRecords(text: string, maxRecords: number): ParsedCsvRecords {
  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let touchedRecord = false;

  const pushRecord = (): ImportIssue | undefined => {
    record.push(field);
    if (!isBlankRecord(record)) {
      if (records.length >= maxRecords) {
        return {
          code: "too_many_rows",
          message: `CSV exceeds the configured limit of ${Math.max(0, maxRecords - 1).toLocaleString()} data rows.`,
          severity: "error"
        };
      }
      records.push(record);
    }
    record = [];
    field = "";
    inQuotes = false;
    afterQuote = false;
    touchedRecord = false;
    return undefined;
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else if (char === "\r" || char === "\n") {
        if (char === "\r" && input[index + 1] === "\n") index += 1;
        field += "\n";
      } else {
        field += char;
      }
      touchedRecord = true;
      continue;
    }

    if (afterQuote) {
      if (char === ",") {
        record.push(field);
        field = "";
        afterQuote = false;
        touchedRecord = true;
        continue;
      }
      if (char === "\r" || char === "\n") {
        if (char === "\r" && input[index + 1] === "\n") index += 1;
        const issue = pushRecord();
        if (issue) return { records: [], issue };
        continue;
      }
      if (char === " " || char === "\t") {
        field += char;
        continue;
      }
      return {
        records: [],
        issue: {
          code: "malformed_csv",
          message: `Unexpected character after a closing quote near character ${index + 1}.`,
          severity: "error"
        }
      };
    }

    if (char === '"') {
      if (field.length > 0) {
        return {
          records: [],
          issue: {
            code: "malformed_csv",
            message: `Unexpected quote in an unquoted field near character ${index + 1}.`,
            severity: "error"
          }
        };
      }
      inQuotes = true;
      touchedRecord = true;
      continue;
    }

    if (char === ",") {
      record.push(field);
      field = "";
      touchedRecord = true;
      continue;
    }

    if (char === "\r" || char === "\n") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      const issue = pushRecord();
      if (issue) return { records: [], issue };
      continue;
    }

    field += char;
    if (char.trim() !== "") touchedRecord = true;
  }

  if (inQuotes) {
    return {
      records: [],
      issue: {
        code: "malformed_csv",
        message: "CSV ended before a quoted field was closed.",
        severity: "error"
      }
    };
  }

  if (touchedRecord || field.length > 0 || record.length > 0 || afterQuote) {
    const issue = pushRecord();
    if (issue) return { records: [], issue };
  }

  return { records };
}

function toRawFields(headers: string[], cells: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()]));
}

function normalizeHttpUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return undefined;

  try {
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (!url.hostname || url.username || url.password) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeInstagramUrl(input: string): string | undefined {
  const normalized = normalizeHttpUrl(input);
  if (!normalized) return undefined;
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    if (hostname !== "instagram.com" && !hostname.endsWith(".instagram.com")) return undefined;
    return normalized;
  } catch {
    return undefined;
  }
}

function normalizeSourceType(input: string, rowNumber: number, issues: ImportIssue[]): LeadSource {
  const normalized = input.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return "csv_import";
  if (VALID_SOURCE_TYPES.has(normalized as LeadSource)) return normalized as LeadSource;
  issues.push({
    code: "unknown_source_type",
    message: `Unknown source type "${input.trim()}"; provenance was recorded as csv_import.`,
    severity: "warning",
    rowNumber,
    field: "sourceType"
  });
  return "csv_import";
}

/** A deterministic versioned fingerprint for the imported record, not a fuzzy identity key. */
export function createImportFingerprint(input: {
  businessName: string;
  location?: string;
  websiteDomain?: string;
  instagramUsername?: string;
  instagramUrl?: string;
  sourceUrl?: string;
  sourceType: LeadSource;
  notes?: string;
}): string {
  return `lead-import:v1:${JSON.stringify([
    normalizeBusinessName(input.businessName),
    normalizeBusinessName(input.location ?? ""),
    input.websiteDomain ?? "",
    input.instagramUsername ?? "",
    input.instagramUrl ?? "",
    input.sourceUrl ?? "",
    input.sourceType,
    input.notes?.trim() ?? ""
  ])}`;
}

/**
 * Parse and validate a CSV before any persistence occurs. Accepted rows may
 * contain review flags for invalid optional fields; rows with structural or
 * required-field errors are returned separately and are never silently dropped.
 */
export function parseLeadCsv(csvText: string, options: ParseLeadCsvOptions = {}): ImportSummary {
  const maxBytes = options.maxBytes ?? MAX_CSV_BYTES;
  const maxRows = options.maxRows ?? MAX_CSV_ROWS;
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || !Number.isInteger(maxRows) || maxRows < 1) {
    return blankSummary([], [{
      code: "invalid_parser_limits",
      message: "CSV parser limits must be positive integers.",
      severity: "error"
    }]);
  }

  if (new TextEncoder().encode(csvText).byteLength > maxBytes) {
    return blankSummary([], [{
      code: "file_too_large",
      message: `CSV exceeds the ${maxBytes.toLocaleString()}-byte limit.`,
      severity: "error"
    }]);
  }

  if (!csvText.trim()) {
    return blankSummary([], [{
      code: "empty_csv",
      message: "CSV file is empty.",
      severity: "error"
    }]);
  }

  const parsed = parseCsvRecords(csvText, maxRows + 1);
  if (parsed.issue) return blankSummary([], [parsed.issue]);

  const [headerRecord, ...dataRecords] = parsed.records;
  if (!headerRecord?.length) {
    return blankSummary([], [{
      code: "missing_header",
      message: "CSV must include a header row.",
      severity: "error"
    }]);
  }

  const headers = headerRecord.map((header) => header.replace(/^\uFEFF/, "").trim());
  const normalizedHeaders = headers.map(normalizeHeader);
  if (normalizedHeaders.some((header) => !header)) {
    return blankSummary(headers, [{
      code: "blank_header",
      message: "Every CSV column must have a non-empty header.",
      severity: "error"
    }]);
  }

  const seenHeaders = new Set<string>();
  for (let index = 0; index < normalizedHeaders.length; index += 1) {
    const header = normalizedHeaders[index];
    if (seenHeaders.has(header)) {
      return blankSummary(headers, [{
        code: "duplicate_header",
        message: `Duplicate CSV header "${headers[index]}". Rename or remove duplicate columns.`,
        severity: "error",
        field: headers[index]
      }]);
    }
    seenHeaders.add(header);
  }

  const fieldNames = normalizedHeaders.map((header) => HEADER_ALIASES[header]);
  const mappedFields = new Set<string>();
  for (let index = 0; index < fieldNames.length; index += 1) {
    const mapped = fieldNames[index];
    if (!mapped) continue;
    if (mappedFields.has(mapped)) {
      return blankSummary(headers, [{
        code: "duplicate_mapped_header",
        message: `More than one CSV column maps to ${mapped}. Keep only one of those columns.`,
        severity: "error",
        field: mapped
      }]);
    }
    mappedFields.add(mapped);
  }

  if (!mappedFields.has("businessName")) {
    return blankSummary(headers, [{
      code: "missing_business_name_column",
      message: "CSV needs a business-name column (businessName, business_name, business, or name).",
      severity: "error",
      field: "businessName"
    }]);
  }

  const rows: ImportLeadRow[] = [];
  const rejectedRows: RejectedImportRow[] = [];
  const issues: ImportIssue[] = [];
  let totalRows = 0;

  for (let index = 0; index < dataRecords.length; index += 1) {
    const cells = dataRecords[index];
    if (isBlankRecord(cells)) continue;
    totalRows += 1;
    const rowNumber = index + 2;
    const rawFields = toRawFields(headers, cells);
    const rowIssues: ImportIssue[] = [];

    if (cells.length !== headers.length) {
      rowIssues.push({
        code: "row_column_count_mismatch",
        message: `Row has ${cells.length} columns but the header has ${headers.length}.`,
        severity: "error",
        rowNumber
      });
    }

    const values: Record<string, string> = {};
    fieldNames.forEach((fieldName, columnIndex) => {
      if (fieldName) values[fieldName] = (cells[columnIndex] ?? "").trim();
    });

    const businessName = values.businessName ?? "";
    const normalizedName = normalizeBusinessName(businessName);
    if (!businessName) {
      rowIssues.push({
        code: "missing_business_name",
        message: "Business name is required.",
        severity: "error",
        rowNumber,
        field: "businessName"
      });
    } else if (!normalizedName) {
      rowIssues.push({
        code: "invalid_business_name",
        message: "Business name contains no usable letters or numbers.",
        severity: "error",
        rowNumber,
        field: "businessName"
      });
    }

    const isRejected = rowIssues.some((issue) => issue.severity === "error");
    if (isRejected) {
      rejectedRows.push({ rowNumber, rawFields, issues: rowIssues });
      issues.push(...rowIssues);
      continue;
    }

    const reviewFlags: string[] = [];
    let websiteUrl: string | undefined;
    let websiteDomain: string | undefined;
    const rawWebsite = values.websiteUrl ?? "";
    if (rawWebsite) {
      websiteUrl = normalizeHttpUrl(rawWebsite);
      websiteDomain = normalizeWebsiteDomain(rawWebsite) ?? undefined;
      if (!websiteUrl || !websiteDomain) {
        websiteUrl = undefined;
        websiteDomain = undefined;
        reviewFlags.push("invalid_website_url");
        rowIssues.push({
          code: "invalid_website_url",
          message: "Website URL could not be normalized; review it before using it.",
          severity: "warning",
          rowNumber,
          field: "websiteUrl"
        });
      }
    }

    const rawInstagramUsername = values.instagramUsername ?? "";
    const instagramUsername = normalizeInstagramUsername(rawInstagramUsername) || undefined;
    if (instagramUsername && !/^[a-z0-9._]{1,30}$/i.test(instagramUsername)) {
      reviewFlags.push("invalid_instagram_username");
      rowIssues.push({
        code: "invalid_instagram_username",
        message: "Instagram username contains characters or a length that should be reviewed.",
        severity: "warning",
        rowNumber,
        field: "instagramUsername"
      });
    }

    let instagramUrl: string | undefined;
    const rawInstagramUrl = values.instagramUrl ?? "";
    if (rawInstagramUrl) {
      instagramUrl = normalizeInstagramUrl(rawInstagramUrl);
      if (!instagramUrl) {
        reviewFlags.push("invalid_instagram_url");
        rowIssues.push({
          code: "invalid_instagram_url",
          message: "Instagram URL is invalid or does not point to an instagram.com host.",
          severity: "warning",
          rowNumber,
          field: "instagramUrl"
        });
      }
    }

    let sourceUrl: string | undefined;
    const rawSourceUrl = values.sourceUrl ?? "";
    if (rawSourceUrl) {
      sourceUrl = normalizeHttpUrl(rawSourceUrl);
      if (!sourceUrl) {
        reviewFlags.push("invalid_source_url");
        rowIssues.push({
          code: "invalid_source_url",
          message: "Source URL could not be normalized; review it before using it as evidence.",
          severity: "warning",
          rowNumber,
          field: "sourceUrl"
        });
      }
    }

    const sourceType = normalizeSourceType(values.sourceType ?? "", rowNumber, rowIssues);
    const location = values.location?.trim() || undefined;
    const notes = values.notes?.trim() || undefined;
    const fingerprint = createImportFingerprint({
      businessName,
      location,
      websiteDomain,
      instagramUsername,
      instagramUrl,
      sourceUrl,
      sourceType,
      notes
    });
    const provenance: LeadSourceProvenance = {
      sourceType,
      sourceUrl,
      rowNumber,
      importFingerprint: fingerprint
    };

    rows.push({
      rowNumber,
      businessName,
      normalizedName,
      location,
      websiteUrl,
      websiteDomain,
      instagramUsername,
      instagramUrl,
      notes,
      sourceType,
      provenance,
      reviewFlags,
      rawFields,
      importFingerprint: fingerprint
    });
    issues.push(...rowIssues);
  }

  return {
    headers,
    rows,
    rejectedRows,
    issues,
    totalRows,
    acceptedCount: rows.length,
    rejectedCount: rejectedRows.length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length
  };
}
