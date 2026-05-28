import { describe, expect, it } from "vitest";

import { parseRangeHeader } from "../server/pdfHttp";

describe("PDF HTTP helpers", () => {
  it("parses a bounded byte range", () => {
    expect(parseRangeHeader("bytes=10-19", 100)).toEqual({
      start: 10,
      end: 19,
      contentLength: 10
    });
  });

  it("parses an open-ended byte range", () => {
    expect(parseRangeHeader("bytes=90-", 100)).toEqual({
      start: 90,
      end: 99,
      contentLength: 10
    });
  });

  it("rejects invalid or unsatisfiable byte ranges", () => {
    expect(parseRangeHeader("items=0-10", 100)).toBeUndefined();
    expect(parseRangeHeader("bytes=120-130", 100)).toBeUndefined();
    expect(parseRangeHeader("bytes=50-40", 100)).toBeUndefined();
  });
});
