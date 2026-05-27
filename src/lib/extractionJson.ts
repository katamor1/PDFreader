import type {
  ExtractionDocument,
  OcrTemplate,
  PdfFile,
  RecognizedField
} from "./types";

export function normalizeOcrText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a5/g, "¥")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function makeOutputFileName(pdfPath: string): string {
  const lastSegment = pdfPath.split(/[\\/]/).pop() ?? pdfPath;
  const baseWithoutExtension = lastSegment.replace(/\.pdf$/i, "");
  const baseName = baseWithoutExtension
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");

  return `${baseName || "extraction"}.ocr.json`;
}

export function buildExtractionDocument(input: {
  sourceFile: PdfFile;
  template: OcrTemplate;
  extractedAt: string;
  recognizedFields: RecognizedField[];
}): ExtractionDocument {
  const fieldsById = new Map(input.template.fields.map((field) => [field.id, field]));
  const warnings: string[] = [];
  const pages = new Map<number, ExtractionDocument["pages"][number]>();
  const fields: Record<string, string> = {};

  for (const recognized of input.recognizedFields) {
    const templateField = fieldsById.get(recognized.fieldId);
    const text = normalizeOcrText(recognized.text);

    fields[recognized.tag] = text;

    if (recognized.warning) {
      warnings.push(`${recognized.tag}: ${recognized.warning}`);
    }

    const page =
      pages.get(recognized.pageNumber) ??
      {
        pageNumber: recognized.pageNumber,
        fields: []
      };

    page.fields.push({
      fieldId: recognized.fieldId,
      tag: recognized.tag,
      text,
      confidence: recognized.confidence,
      rect: templateField?.rect,
      warning: recognized.warning
    });
    pages.set(recognized.pageNumber, page);
  }

  return {
    schemaVersion: 1,
    extractedAt: input.extractedAt,
    sourcePdf: { ...input.sourceFile },
    format: {
      id: input.template.id,
      name: input.template.name,
      documentType: input.template.documentType
    },
    fields,
    pages: Array.from(pages.values()).sort((a, b) => a.pageNumber - b.pageNumber),
    warnings
  };
}
