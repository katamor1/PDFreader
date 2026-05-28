import { describe, expect, it } from "vitest";

import { buildExtractionCsv, makeCsvOutputFileName } from "../src/lib/extractionCsv";
import type { ExtractionDocument } from "../src/lib/types";

const document: ExtractionDocument = {
  schemaVersion: 1,
  extractedAt: "2026-05-28T01:00:00.000Z",
  sourcePdf: {
    id: "file-1",
    name: "注文書,001.pdf",
    path: "C:/docs/order.pdf",
    relativePath: "orders/注文書,001.pdf",
    sizeBytes: 100,
    modifiedAt: "2026-05-28T00:00:00.000Z"
  },
  format: {
    id: "fmt-order-2026",
    name: "2026注文書",
    documentType: "purchase_order"
  },
  fields: {
    amount: "¥ 120,000",
    owner: "佐藤\nSato"
  },
  pages: [
    {
      pageNumber: 1,
      fields: [
        {
          fieldId: "field-amount",
          tag: "amount",
          text: "¥ 120,000",
          confidence: 91.2,
          warning: undefined
        },
        {
          fieldId: "field-owner",
          tag: "owner",
          text: "佐藤\nSato",
          confidence: 80,
          warning: "needs \"review\""
        }
      ]
    }
  ],
  warnings: ["owner: needs \"review\""]
};

describe("extraction CSV", () => {
  it("writes one CSV row per recognized field with escaped values", () => {
    expect(buildExtractionCsv([document])).toBe(
      [
        "\uFEFFsource_pdf,relative_path,format_id,format_name,document_type,extracted_at,page_number,tag,text,confidence,warning",
        "\"C:/docs/order.pdf\",\"orders/注文書,001.pdf\",fmt-order-2026,2026注文書,purchase_order,2026-05-28T01:00:00.000Z,1,amount,\"¥ 120,000\",91.2,",
        "\"C:/docs/order.pdf\",\"orders/注文書,001.pdf\",fmt-order-2026,2026注文書,purchase_order,2026-05-28T01:00:00.000Z,1,owner,\"佐藤\nSato\",80,\"needs \"\"review\"\"\""
      ].join("\r\n") + "\r\n"
    );
  });

  it("uses a timestamped aggregate CSV file name", () => {
    expect(makeCsvOutputFileName("2026-05-28T01:02:03.000Z")).toBe(
      "pdfreader-ocr-20260528-010203.csv"
    );
  });

  it("escapes cells that spreadsheet apps would treat as formulas", () => {
    const riskyDocument: ExtractionDocument = {
      ...document,
      sourcePdf: {
        ...document.sourcePdf,
        path: "=cmd",
        relativePath: "+relative"
      },
      format: {
        ...document.format,
        name: "@format"
      },
      pages: [
        {
          pageNumber: 1,
          fields: [
            {
              fieldId: "field-risky",
              tag: "-tag",
              text: "=2+2",
              confidence: 1,
              warning: "@review"
            }
          ]
        }
      ]
    };

    const row = buildExtractionCsv([riskyDocument]).split("\r\n")[1];
    expect(row).toBe(
      "'=cmd,'+relative,fmt-order-2026,'@format,purchase_order,2026-05-28T01:00:00.000Z,1,'-tag,'=2+2,1,'@review"
    );
  });
});
