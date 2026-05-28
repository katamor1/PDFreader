import { createHash } from "node:crypto";
import { access, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type PdfPageImage = {
  imagePath: string;
  fromCache: boolean;
};

export type PdfPageCacheInput = {
  pdfPath: string;
  pageNumber: number;
  dpi: number;
  sizeBytes: number;
  modifiedAtMs: number;
};

export function buildPdfPageCacheKey(input: PdfPageCacheInput) {
  return createHash("sha1")
    .update(
      [
        path.resolve(input.pdfPath),
        input.pageNumber,
        input.dpi,
        input.sizeBytes,
        Math.trunc(input.modifiedAtMs)
      ].join("\0")
    )
    .digest("hex");
}

export function pdfPageImagePath(cacheDir: string, cacheKey: string) {
  return path.join(path.resolve(cacheDir), `${cacheKey}.png`);
}

export function parsePdfInfoPages(output: string): number | undefined {
  const match = /^Pages:\s+(\d+)\s*$/im.exec(output);
  if (!match) {
    return undefined;
  }

  const pages = Number(match[1]);
  return Number.isInteger(pages) && pages > 0 ? pages : undefined;
}

export async function getPdfPageCount(pdfPath: string): Promise<number | undefined> {
  try {
    const result = await execFileAsync("pdfinfo", [pdfPath], {
      windowsHide: true,
      timeout: 15000
    });
    return parsePdfInfoPages(result.stdout);
  } catch {
    return undefined;
  }
}

export async function rasterizePdfPage(input: {
  pdfPath: string;
  pageNumber: number;
  dpi?: number;
  cacheDir: string;
}): Promise<PdfPageImage> {
  const pageNumber = Math.max(1, Math.trunc(input.pageNumber));
  const dpi = Math.max(72, Math.min(450, Math.trunc(input.dpi ?? 180)));
  const cacheDir = path.resolve(input.cacheDir);
  const pdfStats = await stat(input.pdfPath);
  const key = buildPdfPageCacheKey({
    pdfPath: input.pdfPath,
    pageNumber,
    dpi,
    sizeBytes: pdfStats.size,
    modifiedAtMs: pdfStats.mtimeMs
  });
  const outputPrefix = path.join(cacheDir, key);
  const expectedImagePath = pdfPageImagePath(cacheDir, key);

  try {
    await access(expectedImagePath);
    return { imagePath: expectedImagePath, fromCache: true };
  } catch {
    // Cache miss; render below.
  }

  await mkdir(cacheDir, { recursive: true });
  await execFileAsync(
    "pdftocairo",
    ["-png", "-singlefile", "-f", String(pageNumber), "-l", String(pageNumber), "-r", String(dpi), input.pdfPath, outputPrefix],
    {
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 1024 * 1024
    }
  );

  const singleFilePath = `${outputPrefix}.png`;
  try {
    const rendered = await stat(singleFilePath);
    if (rendered.isFile()) {
      return { imagePath: singleFilePath, fromCache: false };
    }
  } catch {
    // Fall back to prefix scan below.
  }

  const entries = await readdir(cacheDir);
  const renderedName = entries.find((entry) => entry.startsWith(key) && entry.endsWith(".png"));
  if (!renderedName) {
    throw new Error("pdftocairo did not create a page image");
  }

  return { imagePath: path.join(cacheDir, renderedName), fromCache: false };
}
