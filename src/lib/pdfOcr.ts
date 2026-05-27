import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import Tesseract from "tesseract.js";

import { fromNormalizedRect } from "./templateGeometry";
import type { OcrTemplate, PdfFile, RecognizedField } from "./types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type OcrWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>;
type ProgressCallback = (message: string, progress?: number) => void;

export function pdfUrl(file: PdfFile): string {
  return `/api/pdf?path=${encodeURIComponent(file.path)}`;
}

export async function loadPdf(file: PdfFile) {
  return pdfjsLib.getDocument(pdfUrl(file)).promise;
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

async function renderPageToCanvas(pdf: Awaited<ReturnType<typeof loadPdf>>, pageNumber: number) {
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
  const scale = 2;
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

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < image.data.length; index += 4) {
    const gray =
      image.data[index] * 0.299 +
      image.data[index + 1] * 0.587 +
      image.data[index + 2] * 0.114;
    const contrasted = gray > 220 ? 255 : gray < 90 ? 0 : Math.round((gray - 90) * 1.96);
    image.data[index] = contrasted;
    image.data[index + 1] = contrasted;
    image.data[index + 2] = contrasted;
  }
  context.putImageData(image, 0, 0);

  return canvas;
}

export async function recognizeTemplateFields(input: {
  file: PdfFile;
  template: OcrTemplate;
  worker: OcrWorker;
  onProgress?: ProgressCallback;
}): Promise<RecognizedField[]> {
  const pdf = await loadPdf(input.file);

  try {
    const pages = new Map<number, HTMLCanvasElement>();
    const recognized: RecognizedField[] = [];

    for (const field of input.template.fields) {
      if (!pages.has(field.pageNumber)) {
        input.onProgress?.(`${input.file.name}: page ${field.pageNumber}`);
        pages.set(field.pageNumber, await renderPageToCanvas(pdf, field.pageNumber));
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
    await pdf.destroy();
  }
}
