import { describe, expect, it } from "vitest";

import { parsePdfInfoPages } from "../server/pdfTools";

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
});
