import type { ExtractionDocument, OcrTemplate, PdfFile } from "./types";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Keep the HTTP status message when the server did not return JSON.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  async scan(rootDir: string): Promise<{ rootDir: string; files: PdfFile[] }> {
    return requestJson("/api/scan", {
      method: "POST",
      body: JSON.stringify({ rootDir })
    });
  },

  async listTemplates(): Promise<OcrTemplate[]> {
    const response = await requestJson<{ templates: OcrTemplate[] }>("/api/templates");
    return response.templates;
  },

  async saveTemplate(template: OcrTemplate): Promise<OcrTemplate> {
    const response = await requestJson<{ template: OcrTemplate }>("/api/templates", {
      method: "POST",
      body: JSON.stringify({ template })
    });
    return response.template;
  },

  async deleteTemplate(templateId: string): Promise<void> {
    await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
      method: "DELETE"
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
    });
  },

  async saveExtractions(
    outputDir: string,
    documents: ExtractionDocument[]
  ): Promise<{ outputDir: string; written: Array<{ pdf: string; json: string }> }> {
    return requestJson("/api/extractions", {
      method: "POST",
      body: JSON.stringify({ outputDir, documents })
    });
  }
};
