import type { ExtractionDocument, PdfFile } from "./types";

export type ExtractionMap = Record<string, ExtractionDocument>;
export type TemplateAssignments = Record<string, string>;

export function currentExtractionDocuments(
  files: PdfFile[],
  extractions: ExtractionMap
): ExtractionDocument[] {
  return files
    .map((file) => extractions[file.id])
    .filter((document): document is ExtractionDocument => Boolean(document));
}

export function removeExtractionForFile(
  extractions: ExtractionMap,
  fileId: string
): ExtractionMap {
  if (!extractions[fileId]) {
    return extractions;
  }

  const next = { ...extractions };
  delete next[fileId];
  return next;
}

export function removeExtractionsForTemplate(
  extractions: ExtractionMap,
  assignments: TemplateAssignments,
  templateId: string
): ExtractionMap {
  let next = extractions;

  for (const [fileId, assignedTemplateId] of Object.entries(assignments)) {
    if (assignedTemplateId !== templateId || !next[fileId]) {
      continue;
    }

    if (next === extractions) {
      next = { ...extractions };
    }
    delete next[fileId];
  }

  return next;
}
