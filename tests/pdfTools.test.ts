import { describe, expect, it } from "vitest";

import { buildPdfPageCacheKey, parsePdfInfoPages, pdfPageImagePath } from "../server/pdfTools";

describe("PDF tool helpers", () => {
  it("extracts page count from pdfinfo output", () => {
    expect(
      parsePdfInfoPages(`
Title:          sample
Pages:          12
Page size:      595 x 842 pts
`)
    ).toBe(12);
  });

  it("returns undefined when pdfinfo output has no page count", () => {
    expect(parsePdfInfoPages("Title: sample")).toBeUndefined();
  });

  it("uses the pdftocairo single-file output path for page image cache entries", () => {
    expect(pdfPageImagePath("C:/tmp/pdf-cache", "cache-key")).toMatch(/pdf-cache[\\/]cache-key\.png$/);
  });

  it("includes file metadata in page image cache keys", () => {
    const base = {
      pdfPath: "C:/docs/order.pdf",
      pageNumber: 1,
      dpi: 180,
      sizeBytes: 40960,
      modifiedAtMs: 1779980000000
    };

    expect(buildPdfPageCacheKey(base)).toBe(buildPdfPageCacheKey({ ...base }));
    expect(buildPdfPageCacheKey(base)).not.toBe(
      buildPdfPageCacheKey({ ...base, modifiedAtMs: base.modifiedAtMs + 1000 })
    );
    expect(buildPdfPageCacheKey(base)).not.toBe(
      buildPdfPageCacheKey({ ...base, sizeBytes: base.sizeBytes + 1 })
    );
  });
});
