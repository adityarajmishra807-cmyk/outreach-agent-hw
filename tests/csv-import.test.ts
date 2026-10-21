import { describe, expect, it } from "vitest";
import {
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  createImportFingerprint,
  parseLeadCsv
} from "../packages/shared/src/csv-import";

describe("CSV lead import contract", () => {
  it("parses aliases, quoted commas, escaped quotes, embedded newlines, and normalizes values", () => {
    const csv = [
      "Business Name,Location,Website,Instagram Handle,Instagram URL,Source URL,Source Type,Notes",
      "\"Café, North\",Dehradun,example.com,@@North.Gym,https://www.instagram.com/North.Gym/,https://biz.example/about,business_website,\"Says \"\"best gym\"\"",
      "open 24/7\""
    ].join("\r\n");

    const summary = parseLeadCsv(csv);
    expect(summary.acceptedCount).toBe(1);
    expect(summary.rejectedCount).toBe(0);
    expect(summary.warningCount).toBe(0);
    expect(summary.rows[0]).toMatchObject({
      rowNumber: 2,
      businessName: "Café, North",
      normalizedName: "cafe north",
      location: "Dehradun",
      websiteUrl: "https://example.com/",
      websiteDomain: "example.com",
      instagramUsername: "north.gym",
      instagramUrl: "https://www.instagram.com/North.Gym/",
      sourceUrl: "https://biz.example/about",
      sourceType: "business_website",
      notes: 'Says "best gym"\nopen 24/7',
      reviewFlags: []
    });
    expect(summary.rows[0].provenance).toMatchObject({
      sourceType: "business_website",
      sourceUrl: "https://biz.example/about",
      rowNumber: 2,
      importFingerprint: summary.rows[0].importFingerprint
    });
  });

  it("supports a UTF-8 BOM, case-insensitive header aliases, and blank lines", () => {
    const summary = parseLeadCsv("\uFEFF NAME , WEBSITE_URL \r\n\r\nExample Gym,https://www.example.com/\r\n");
    expect(summary.acceptedCount).toBe(1);
    expect(summary.totalRows).toBe(1);
    expect(summary.rows[0].rowNumber).toBe(3);
    expect(summary.rows[0].businessName).toBe("Example Gym");
    expect(summary.rows[0].websiteDomain).toBe("example.com");
    expect(summary.issues).toEqual([]);
  });

  it("rejects rows with missing business names but preserves the raw rejected row", () => {
    const summary = parseLeadCsv("business_name,location\n,Dehradun\nGym One,Dehradun\n");
    expect(summary.acceptedCount).toBe(1);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.rejectedRows[0]).toMatchObject({
      rowNumber: 2,
      rawFields: { business_name: "", location: "Dehradun" }
    });
    expect(summary.rejectedRows[0].issues.map((issue) => issue.code)).toContain("missing_business_name");
    expect(summary.issues).toContainEqual(expect.objectContaining({
      code: "missing_business_name",
      severity: "error",
      rowNumber: 2
    }));
  });

  it("reports CSV row positions accurately after blank lines", () => {
    const summary = parseLeadCsv("businessName,location\n\n,Dehradun\nGym One,Dehradun\n");
    expect(summary.rejectedRows[0].rowNumber).toBe(3);
    expect(summary.rows[0].rowNumber).toBe(4);
  });

  it("rejects malformed row widths rather than silently shifting fields", () => {
    const summary = parseLeadCsv("businessName,website\nGym One\n");
    expect(summary.acceptedCount).toBe(0);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.rejectedRows[0].issues[0]).toMatchObject({
      code: "row_column_count_mismatch",
      severity: "error",
      rowNumber: 2
    });
  });

  it("fails closed for duplicate headers and aliases that map to the same field", () => {
    const duplicateExact = parseLeadCsv("businessName,businessName\nGym One,Gym Two\n");
    expect(duplicateExact.issues[0].code).toBe("duplicate_header");
    expect(duplicateExact.acceptedCount).toBe(0);

    const duplicateAlias = parseLeadCsv("Business Name,business_name\nGym One,Gym One\n");
    expect(duplicateAlias.issues[0].code).toBe("duplicate_header");
    expect(duplicateAlias.acceptedCount).toBe(0);
  });

  it("requires a recognized business-name header and non-empty headers", () => {
    expect(parseLeadCsv("website,location\nexample.com,Dehradun\n").issues[0].code)
      .toBe("missing_business_name_column");
    expect(parseLeadCsv("businessName,,location\nGym One,,Dehradun\n").issues[0].code)
      .toBe("blank_header");
  });

  it("flags invalid optional URLs/handles for review without rejecting the business row", () => {
    const summary = parseLeadCsv(
      "businessName,website,instagramUsername,instagramUrl,sourceUrl\nGym One,https:// bad url,not a handle,https://example.com/profile,ftp://source.example"
    );
    expect(summary.acceptedCount).toBe(1);
    expect(summary.rejectedCount).toBe(0);
    expect(summary.warningCount).toBe(4);
    expect(summary.rows[0].reviewFlags).toEqual([
      "invalid_website_url",
      "invalid_instagram_username",
      "invalid_instagram_url",
      "invalid_source_url"
    ]);
    expect(summary.rows[0].websiteUrl).toBeUndefined();
    expect(summary.rows[0].instagramUrl).toBeUndefined();
    expect(summary.rows[0].provenance.sourceUrl).toBeUndefined();
  });

  it("falls back to csv_import for an unrecognized source type with a warning", () => {
    const summary = parseLeadCsv("businessName,sourceType\nGym One,random_source\n");
    expect(summary.rows[0].sourceType).toBe("csv_import");
    expect(summary.issues).toContainEqual(expect.objectContaining({
      code: "unknown_source_type",
      rowNumber: 2,
      severity: "warning"
    }));
  });

  it("rejects unterminated quotes and illegal quote placement", () => {
    expect(parseLeadCsv('businessName,notes\nGym One,"not closed').issues[0].code)
      .toBe("malformed_csv");
    expect(parseLeadCsv('businessName,notes\nGym "One",note\n').issues[0].code)
      .toBe("malformed_csv");
  });

  it("enforces byte and row limits before returning partial imports", () => {
    const tooLarge = parseLeadCsv("businessName\nGym", { maxBytes: 4 });
    expect(tooLarge.issues[0].code).toBe("file_too_large");
    expect(tooLarge.acceptedCount).toBe(0);

    const tooManyRows = parseLeadCsv("businessName\nOne\nTwo\nThree", { maxRows: 2 });
    expect(tooManyRows.issues[0].code).toBe("too_many_rows");
    expect(tooManyRows.acceptedCount).toBe(0);
    expect(MAX_CSV_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_CSV_ROWS).toBe(5000);
  });

  it("produces a deterministic versioned import fingerprint from normalized data", () => {
    const input = {
      businessName: " Café North ",
      location: "DEHRADUN",
      websiteDomain: "example.com",
      instagramUsername: "north.gym",
      sourceType: "csv_import" as const
    };
    expect(createImportFingerprint(input)).toBe(createImportFingerprint({
      ...input,
      businessName: "Café North",
      location: "dehradun"
    }));
    expect(createImportFingerprint(input)).not.toBe(createImportFingerprint({
      ...input,
      sourceUrl: "https://example.com/source"
    }));
  });
});
