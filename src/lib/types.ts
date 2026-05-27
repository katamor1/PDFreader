export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RenderedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

export type OcrField = {
  id: string;
  tag: string;
  pageNumber: number;
  rect: NormalizedRect;
};

export type OcrTemplate = {
  id: string;
  name: string;
  documentType: string;
  createdAt: string;
  updatedAt: string;
  fields: OcrField[];
};

export type PdfFile = {
  id: string;
  name: string;
  path: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type RecognizedField = {
  fieldId: string;
  tag: string;
  pageNumber: number;
  text: string;
  confidence?: number;
  warning?: string;
};

export type ExtractionDocument = {
  schemaVersion: 1;
  extractedAt: string;
  sourcePdf: {
    id: string;
    name: string;
    path: string;
    relativePath: string;
    sizeBytes: number;
    modifiedAt: string;
  };
  format: {
    id: string;
    name: string;
    documentType: string;
  };
  fields: Record<string, string>;
  pages: Array<{
    pageNumber: number;
    fields: Array<{
      fieldId: string;
      tag: string;
      text: string;
      confidence?: number;
      rect?: NormalizedRect;
      warning?: string;
    }>;
  }>;
  warnings: string[];
};
