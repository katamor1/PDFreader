import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import Tesseract from "tesseract.js";

import { applyBlackWhiteContrast } from "./imagePreprocessing";
import { fromNormalizedRect } from "./templateGeometry";
import type { OcrTemplate, PdfFile, RecognizedField } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type OcrWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>;
type ProgressCallback = (message: string, progress?: number) => void;

export function pdfUrl(file: PdfFile): string {
  return `/api/pdf?path=${encodeURIComponent(file.path)}`;
}

export function pdfPageImageUrl(file: PdfFile, pageNumber: number, dpi = 180): string {
  return `/api/pdf-page-image?path=${encodeURIComponent(file.path)}&page=${pageNumber}&dpi=${dpi}`;
}

export async function loadPdf(file: PdfFile) {
  return pdfjsLib.getDocument(pdfUrl(file)).promise;
}

export async function loadPdfInfo(file: PdfFile): Promise<{ pages?: number; sizeBytes: number }> {
  const response = await fetch(`/api/pdf-info?path=${encodeURIComponent(file.path)}`);
  if (!response.ok) {
    throw new Error(`PDF info failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as { pages?: number; sizeBytes: number };
}

export async function createOcrWorker(onProgress?: ProgressCallback): Promise<OcrWorker> {
  const worker = await Tesseract.createWorker("jpn+eng", undefined, {
    logger: (message) => {
      if (message.status) {
        onProgress?.(message.status, message.progress);
      }
    }
  });

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });

  return worker;
}

async function renderPdfJsPageToCanvas(pdf: Awaited<ReturnType<typeof loadPdf>>, pageNumber: number) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load page image: ${src}`));
    image.src = src;
  });
}

export async function renderPdfPageImageToCanvas(
  file: PdfFile,
  pageNumber: number,
  dpi = 180
): Promise<HTMLCanvasElement> {
  const image = await loadImage(pdfPageImageUrl(file, pageNumber, dpi));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
}

async function renderPageToCanvas(input: {
  file: PdfFile;
  pdf?: Awaited<ReturnType<typeof loadPdf>>;
  pageNumber: number;
}) {
  if (input.pdf) {
    return renderPdfJsPageToCanvas(input.pdf, input.pageNumber);
  }

  return renderPdfPageImageToCanvas(input.file, input.pageNumber, 300);
}

function cropField(pageCanvas: HTMLCanvasElement, field: OcrTemplate["fields"][number]) {
  const renderedRect = fromNormalizedRect(field.rect, {
    width: pageCanvas.width,
    height: pageCanvas.height
  });
  const margin = Math.max(4, Math.round(Math.min(renderedRect.width, renderedRect.height) * 0.04));
  const left = Math.max(0, renderedRect.x - margin);
  const top = Math.max(0, renderedRect.y - margin);
  const right = Math.min(pageCanvas.width, renderedRect.x + renderedRect.width + margin);
  const bottom = Math.min(pageCanvas.height, renderedRect.y + renderedRect.height + margin);
  const cropCanvas = document.createElement("canvas");
  const context = cropCanvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }

  cropCanvas.width = Math.max(1, right - left);
  cropCanvas.height = Math.max(1, bottom - top);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
  context.drawImage(
    pageCanvas,
    left,
    top,
    cropCanvas.width,
    cropCanvas.height,
    0,
    0,
    cropCanvas.width,
    cropCanvas.height
  );

  return preprocessCrop(cropCanvas);
}

function preprocessCrop(sourceCanvas: HTMLCanvasElement) {
  const scale = 3;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    throw new Error("Canvas 2D context is not available");
  }

  canvas.width = sourceCanvas.width * scale;
  canvas.height = sourceCanvas.height * scale;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);

  const image = applyBlackWhiteContrast(context.getImageData(0, 0, canvas.width, canvas.height));
  context.putImageData(image, 0, 0);

  return canvas;
}

export async function recognizeTemplateFields(input: {
  file: PdfFile;
  template: OcrTemplate;
  worker: OcrWorker;
  onProgress?: ProgressCallback;
}): Promise<RecognizedField[]> {
  let pdf: Awaited<ReturnType<typeof loadPdf>> | undefined;
  try {
    pdf = await loadPdf(input.file);
  } catch {
    pdf = undefined;
  }

  try {
    const pages = new Map<number, HTMLCanvasElement>();
    const recognized: RecognizedField[] = [];

    for (const field of input.template.fields) {
      if (!pages.has(field.pageNumber)) {
        input.onProgress?.(`${input.file.name}: page ${field.pageNumber}`);
        pages.set(
          field.pageNumber,
          await renderPageToCanvas({
            file: input.file,
            pdf,
            pageNumber: field.pageNumber
          })
        );
      }

      const pageCanvas = pages.get(field.pageNumber);
      if (!pageCanvas) {
        continue;
      }

      input.onProgress?.(`${input.file.name}: ${field.tag}`);
      try {
        const cropCanvas = cropField(pageCanvas, field);
        const result = await input.worker.recognize(cropCanvas);
        recognized.push({
          fieldId: field.id,
          tag: field.tag,
          pageNumber: field.pageNumber,
          text: result.data.text,
          confidence: Number(result.data.confidence.toFixed(1))
        });
      } catch (error) {
        recognized.push({
          fieldId: field.id,
          tag: field.tag,
          pageNumber: field.pageNumber,
          text: "",
          warning: error instanceof Error ? error.message : "OCR failed"
        });
      }
    }

    return recognized;
  } finally {
    await pdf?.destroy();
  }
}
