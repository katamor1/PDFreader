import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { OcrTemplate } from "../src/lib/types";

type TemplateFile = {
  templates: OcrTemplate[];
};

export class TemplateStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = path.join(dataDir, "templates.json");
  }

  async list(): Promise<OcrTemplate[]> {
    const file = await this.readFile();
    return [...file.templates].sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsert(template: OcrTemplate): Promise<OcrTemplate> {
    const file = await this.readFile();
    const now = new Date().toISOString();
    const nextTemplate: OcrTemplate = {
      ...template,
      updatedAt: now,
      createdAt: template.createdAt || now
    };
    const index = file.templates.findIndex((item) => item.id === template.id);

    if (index >= 0) {
      file.templates[index] = nextTemplate;
    } else {
      file.templates.push(nextTemplate);
    }

    await this.writeFile(file);
    return nextTemplate;
  }

  async delete(templateId: string): Promise<void> {
    const file = await this.readFile();
    await this.writeFile({
      templates: file.templates.filter((template) => template.id !== templateId)
    });
  }

  private async readFile(): Promise<TemplateFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as TemplateFile;
      return { templates: Array.isArray(parsed.templates) ? parsed.templates : [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { templates: [] };
      }
      throw error;
    }
  }

  private async writeFile(file: TemplateFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  }
}
