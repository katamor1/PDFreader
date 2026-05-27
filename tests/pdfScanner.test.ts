import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findPdfFiles } from "../server/pdfScanner";

describe("pdf scanner", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "pdfreader-"));
    await mkdir(path.join(rootDir, "nested"));
    await writeFile(path.join(rootDir, "quote.pdf"), "not a real pdf");
    await writeFile(path.join(rootDir, "nested", "order.PDF"), "not a real pdf");
    await writeFile(path.join(rootDir, "notes.txt"), "ignore me");
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("recursively lists only PDF files with stable relative paths", async () => {
    const files = await findPdfFiles(rootDir);

    expect(files.map((file) => file.relativePath)).toEqual([
      "nested/order.PDF",
      "quote.pdf"
    ]);
    expect(files[0]).toMatchObject({
      name: "order.PDF",
      path: path.join(rootDir, "nested", "order.PDF")
    });
    expect(files[0].id).toHaveLength(40);
    expect(files[0].sizeBytes).toBeGreaterThan(0);
  });
});
