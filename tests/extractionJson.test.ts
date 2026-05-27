import { describe, expect, it } from "vitest";

import {
  buildExtractionDocument,
  makeOutputFileName,
  normalizeOcrText
} from "../src/lib/extractionJson";
import type { OcrTemplate } from "../src/lib/types";

const template: OcrTemplate = {
  id: "fmt-quote-2026",
  name: "2026 quote request",
  documentType: "quote_request",
  createdAt: "2026-05-28T00:00:00.000Z",
  updatedAt: "2026-05-28T00:00:00.000Z",
  fields: [
    {
      id: "field-amount",
      tag: "amount",
      pageNumber: 1,
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.1 }
    },
    {
      id: "field-owner",
      tag: "owner",
      pageNumber: 1,
      rect: { x: 0.5, y: 0.2, width: 0.2, height: 0.1 }
    }
  ]
};

describe("extraction json", () => {
  it("normalizes OCR text without removing business symbols", () => {
    expect(normalizeOcrText("  ABC-１２３  \r\n  ￥  1,200  ")).toBe(
      "ABC-123\n¥ 1,200"
    );
  });

  it("builds a stable JSON document for downstream consistency checks", () => {
    const document = buildExtractionDocument({
      sourceFile: {
        id: "file-1",
        name: "quote.pdf",
        path: "C:/docs/quote.pdf",
        relativePath: "quote.pdf",
        sizeBytes: 100,
        modifiedAt: "2026-05-28T00:00:00.000Z"
      },
      template,
      extractedAt: "2026-05-28T01:00:00.000Z",
      recognizedFields: [
        {
          fieldId: "field-amount",
          tag: "amount",
          pageNumber: 1,
          text: "¥ 120,000",
          confidence: 91.2
        },
        {
          fieldId: "field-owner",
          tag: "owner",
          pageNumber: 1,
          text: "Sato",
          confidence: 86.5
        }
      ]
    });

    expect(document).toMatchObject({
      schemaVersion: 1,
      sourcePdf: {
        path: "C:/docs/quote.pdf",
        relativePath: "quote.pdf"
      },
      format: {
        id: "fmt-quote-2026",
        name: "2026 quote request",
        documentType: "quote_request"
      },
      fields: {
        amount: "¥ 120,000",
        owner: "Sato"
      },
      pages: [
        {
          pageNumber: 1,
          fields: [
            {
              tag: "amount",
              text: "¥ 120,000",
              confidence: 91.2
            },
            {
              tag: "owner",
              text: "Sato",
              confidence: 86.5
            }
          ]
        }
      ],
      warnings: []
    });
  });

  it("uses the PDF base name for output JSON files", () => {
    expect(makeOutputFileName("C:/docs/Order 001.pdf")).toBe(
      "Order_001.ocr.json"
    );
  });
});
