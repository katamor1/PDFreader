import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type { PdfFile } from "../src/lib/types";

function toRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}

function fileId(absolutePath: string): string {
  return createHash("sha1").update(path.resolve(absolutePath)).digest("hex");
}

export async function findPdfFiles(rootDir: string): Promise<PdfFile[]> {
  const resolvedRoot = path.resolve(rootDir);
  const rootStats = await stat(resolvedRoot);

  if (!rootStats.isDirectory()) {
    throw new Error(`Not a directory: ${resolvedRoot}`);
  }

  const files: PdfFile[] = [];

  async function walk(directory: string) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".pdf") {
        continue;
      }

      const stats = await stat(absolutePath);
      files.push({
        id: fileId(absolutePath),
        name: entry.name,
        path: absolutePath,
        relativePath: toRelativePath(resolvedRoot, absolutePath),
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString()
      });
    }
  }

  await walk(resolvedRoot);

  return files.sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath, "en", { sensitivity: "base" })
  );
}
