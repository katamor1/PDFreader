import cors from "cors";
import express from "express";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildExtractionDocument, makeOutputFileName } from "../src/lib/extractionJson";
import { buildExtractionCsv, makeCsvOutputFileName } from "../src/lib/extractionCsv";
import type { ExtractionDocument, OcrTemplate } from "../src/lib/types";
import { parseRangeHeader } from "./pdfHttp";
import { findPdfFiles } from "./pdfScanner";
import { TemplateStore } from "./templateStore";
import { getPdfPageCount, rasterizePdfPage } from "./pdfTools";

const app = express();
const port = Number(process.env.PORT ?? 4174);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.resolve(process.env.PDFREADER_DATA_DIR ?? path.join(projectRoot, "data"));
const pageImageCacheDir = path.join(dataDir, "page-cache");
const templateStore = new TemplateStore(dataDir);

app.use(cors());
app.use(express.json({ limit: "25mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, dataDir });
});

app.post("/api/scan", async (request, response, next) => {
  try {
    const rootDir = String(request.body?.rootDir ?? "").trim();
    if (!rootDir) {
      response.status(400).json({ error: "rootDir is required" });
      return;
    }

    const files = await findPdfFiles(rootDir);
    response.json({ rootDir: path.resolve(rootDir), files });
  } catch (error) {
    next(error);
  }
});

app.get("/api/pdf", async (request, response, next) => {
  try {
    const pdfPath = String(request.query.path ?? "");
    const resolvedPath = path.resolve(pdfPath);
    const stats = await stat(resolvedPath);

    if (!stats.isFile() || path.extname(resolvedPath).toLowerCase() !== ".pdf") {
      response.status(404).json({ error: "PDF not found" });
      return;
    }

    const range = parseRangeHeader(request.headers.range, stats.size);
    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Type", "application/pdf");

    if (range) {
      response.status(206);
      response.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${stats.size}`);
      response.setHeader("Content-Length", String(range.contentLength));
      createReadStream(resolvedPath, { start: range.start, end: range.end })
        .on("error", next)
        .pipe(response);
      return;
    }

    response.setHeader("Content-Length", String(stats.size));
    createReadStream(resolvedPath)
      .on("error", next)
      .pipe(response);
  } catch (error) {
    next(error);
  }
});

app.get("/api/pdf-info", async (request, response, next) => {
  try {
    const pdfPath = String(request.query.path ?? "");
    const resolvedPath = path.resolve(pdfPath);
    const stats = await stat(resolvedPath);

    if (!stats.isFile() || path.extname(resolvedPath).toLowerCase() !== ".pdf") {
      response.status(404).json({ error: "PDF not found" });
      return;
    }

    response.json({
      path: resolvedPath,
      sizeBytes: stats.size,
      pages: await getPdfPageCount(resolvedPath)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/pdf-page-image", async (request, response, next) => {
  try {
    const pdfPath = String(request.query.path ?? "");
    const resolvedPath = path.resolve(pdfPath);
    const stats = await stat(resolvedPath);

    if (!stats.isFile() || path.extname(resolvedPath).toLowerCase() !== ".pdf") {
      response.status(404).json({ error: "PDF not found" });
      return;
    }

    const pageNumber = Number(request.query.page ?? 1);
    const dpi = Number(request.query.dpi ?? 180);
    const image = await rasterizePdfPage({
      pdfPath: resolvedPath,
      pageNumber,
      dpi,
      cacheDir: pageImageCacheDir
    });
    const imageStats = await stat(image.imagePath);

    response.setHeader("Content-Type", "image/png");
    response.setHeader("Content-Length", String(imageStats.size));
    response.setHeader("X-PDFReader-Render-Mode", image.fromCache ? "poppler-cache" : "poppler");
    createReadStream(image.imagePath)
      .on("error", next)
      .pipe(response);
  } catch (error) {
    next(error);
  }
});

app.get("/api/templates", async (_request, response, next) => {
  try {
    response.json({ templates: await templateStore.list() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/templates", async (request, response, next) => {
  try {
    const template = request.body?.template as OcrTemplate | undefined;
    if (!template?.id || !template.name) {
      response.status(400).json({ error: "template.id and template.name are required" });
      return;
    }

    response.json({ template: await templateStore.upsert(template) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/templates/:id", async (request, response, next) => {
  try {
    await templateStore.delete(request.params.id);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/extractions", async (request, response, next) => {
  try {
    const documents = request.body?.documents as ExtractionDocument[] | undefined;
    const outputDir = path.resolve(
      String(request.body?.outputDir || path.join(dataDir, "output"))
    );

    if (!Array.isArray(documents) || documents.length === 0) {
      response.status(400).json({ error: "documents must contain at least one item" });
      return;
    }

    await mkdir(outputDir, { recursive: true });

    const written: Array<{ pdf: string; json: string }> = [];
    for (const document of documents) {
      const outputName = makeOutputFileName(document.sourcePdf.relativePath || document.sourcePdf.path);
      const outputPath = path.join(outputDir, outputName);
      await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      written.push({ pdf: document.sourcePdf.path, json: outputPath });
    }

    response.json({ outputDir, written });
  } catch (error) {
    next(error);
  }
});

app.post("/api/extractions/csv", async (request, response, next) => {
  try {
    const documents = request.body?.documents as ExtractionDocument[] | undefined;
    const outputDir = path.resolve(
      String(request.body?.outputDir || path.join(dataDir, "output"))
    );

    if (!Array.isArray(documents) || documents.length === 0) {
      response.status(400).json({ error: "documents must contain at least one item" });
      return;
    }

    await mkdir(outputDir, { recursive: true });

    const extractedAt = documents[0]?.extractedAt ?? new Date().toISOString();
    const outputPath = path.join(outputDir, makeCsvOutputFileName(extractedAt));
    await writeFile(outputPath, buildExtractionCsv(documents), "utf8");

    response.json({
      outputDir,
      csv: outputPath,
      rows: documents.reduce((sum, document) => {
        return sum + document.pages.reduce((pageSum, page) => pageSum + page.fields.length, 0);
      }, 0)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/build-extraction", (request, response) => {
  response.json({
    document: buildExtractionDocument({
      sourceFile: request.body.sourceFile,
      template: request.body.template,
      extractedAt: new Date().toISOString(),
      recognizedFields: request.body.recognizedFields ?? []
    })
  });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  response.status(500).json({ error: message });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`PDFreader API listening on http://127.0.0.1:${port}`);
});
