import { describe, expect, it } from "vitest";

import {
  currentExtractionDocuments,
  removeExtractionForFile,
  removeExtractionsForTemplate
} from "../src/lib/extractionState";
import type { ExtractionDocument, PdfFile } from "../src/lib/types";

const fileA: PdfFile = {
  id: "file-a",
  name: "a.pdf",
  path: "C:/docs/a.pdf",
  relativePath: "a.pdf",
  sizeBytes: 100,
  modifiedAt: "2026-05-28T00:00:00.000Z"
};

const fileB: PdfFile = {
  ...fileA,
  id: "file-b",
  name: "b.pdf",
  path: "C:/docs/b.pdf",
  relativePath: "b.pdf"
};

function documentFor(file: PdfFile, formatId = "fmt-1"): ExtractionDocument {
  return {
    schemaVersion: 1,
    extractedAt: "2026-05-28T01:00:00.000Z",
    sourcePdf: { ...file },
    format: {
      id: formatId,
      name: formatId,
      documentType: "document"
    },
    fields: {},
    pages: [],
    warnings: []
  };
}

describe("extraction state helpers", () => {
  it("collects only extraction documents for the current scanned file list", () => {
    const staleDocument = documentFor({ ...fileA, id: "old-file" });

    expect(
      currentExtractionDocuments([fileB, fileA], {
        [fileA.id]: documentFor(fileA),
        [fileB.id]: documentFor(fileB),
        "old-file": staleDocument
      }).map((document) => document.sourcePdf.id)
    ).toEqual(["file-b", "file-a"]);
  });

  it("removes a file extraction when its format assignment changes", () => {
    expect(
      removeExtractionForFile(
        {
          [fileA.id]: documentFor(fileA),
          [fileB.id]: documentFor(fileB)
        },
        fileA.id
      )
    ).toEqual({
      [fileB.id]: documentFor(fileB)
    });
  });

  it("removes all extractions tied to an edited or deleted template", () => {
    expect(
      removeExtractionsForTemplate(
        {
          [fileA.id]: documentFor(fileA, "fmt-1"),
          [fileB.id]: documentFor(fileB, "fmt-2")
        },
        {
          [fileA.id]: "fmt-1",
          [fileB.id]: "fmt-2"
        },
        "fmt-1"
      )
    ).toEqual({
      [fileB.id]: documentFor(fileB, "fmt-2")
    });
  });
});
