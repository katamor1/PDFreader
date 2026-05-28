import type { ExtractionDocument } from "./types";

const CSV_HEADERS = [
  "source_pdf",
  "relative_path",
  "format_id",
  "format_name",
  "document_type",
  "extracted_at",
  "page_number",
  "tag",
  "text",
  "confidence",
  "warning"
];

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  if (!/[",\r\n\\/]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function makeCsvOutputFileName(extractedAt: string): string {
  const compactTimestamp = extractedAt
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .replace("T", "-");

  return `pdfreader-ocr-${compactTimestamp}.csv`;
}

export function buildExtractionCsv(documents: ExtractionDocument[]): string {
  const rows = [CSV_HEADERS.map(csvCell).join(",")];

  for (const document of documents) {
    for (const page of document.pages) {
      for (const field of page.fields) {
        rows.push(
          [
            document.sourcePdf.path,
            document.sourcePdf.relativePath,
            document.format.id,
            document.format.name,
            document.format.documentType,
            document.extractedAt,
            page.pageNumber,
            field.tag,
            field.text,
            field.confidence,
            field.warning
          ]
            .map(csvCell)
            .join(",")
        );
      }
    }
  }

  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
