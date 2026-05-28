import {
  Archive,
  FileSearch,
  FolderOpen,
  Loader2,
  Play,
  Save,
  ScanText,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PdfPreview } from "./components/PdfPreview";
import { api } from "./lib/api";
import { buildExtractionDocument } from "./lib/extractionJson";
import { createOcrWorker, recognizeTemplateFields } from "./lib/pdfOcr";
import type {
  ExtractionDocument,
  NormalizedRect,
  OcrField,
  OcrTemplate,
  PdfFile
} from "./lib/types";

type Assignments = Record<string, string>;
type JobState = {
  running: boolean;
  message: string;
  progress?: number;
};

const nowIso = () => new Date().toISOString();

function createTemplate(name: string, documentType: string): OcrTemplate {
  const now = nowIso();
  return {
    id: crypto.randomUUID(),
    name: name.trim() || "新規フォーマット",
    documentType: documentType.trim() || "document",
    createdAt: now,
    updatedAt: now,
    fields: []
  };
}

export default function App() {
  const [rootDir, setRootDir] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [files, setFiles] = useState<PdfFile[]>([]);
  const [templates, setTemplates] = useState<OcrTemplate[]>([]);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [selectedFileId, setSelectedFileId] = useState<string>();
  const [activeTemplateId, setActiveTemplateId] = useState<string>();
  const [selectedFieldId, setSelectedFieldId] = useState<string>();
  const [newTemplateName, setNewTemplateName] = useState("2026年度見積依頼書フォーマット");
  const [newDocumentType, setNewDocumentType] = useState("quote_request");
  const [extractions, setExtractions] = useState<Record<string, ExtractionDocument>>({});
  const [job, setJob] = useState<JobState>({ running: false, message: "待機中" });

  useEffect(() => {
    void refreshTemplates();
  }, []);

  const selectedFile = files.find((file) => file.id === selectedFileId);
  const activeTemplate = templates.find((template) => template.id === activeTemplateId);
  const selectedField = activeTemplate?.fields.find((field) => field.id === selectedFieldId);
  const assignedCount = files.filter((file) => assignments[file.id]).length;

  const readyFiles = useMemo(
    () =>
      files.filter((file) => {
        const template = templates.find((item) => item.id === assignments[file.id]);
        return template && template.fields.length > 0;
      }),
    [assignments, files, templates]
  );

  async function refreshTemplates() {
    try {
      const loaded = await api.listTemplates();
      setTemplates(loaded);
      if (!activeTemplateId && loaded.length > 0) {
        setActiveTemplateId(loaded[0].id);
      }
    } catch (error) {
      setJob({ running: false, message: error instanceof Error ? error.message : "フォーマット読込失敗" });
    }
  }

  async function scanFolder() {
    setJob({ running: true, message: "PDF検索中" });
    try {
      const response = await api.scan(rootDir);
      setRootDir(response.rootDir);
      setFiles(response.files);
      setSelectedFileId(response.files[0]?.id);
      setJob({ running: false, message: `${response.files.length}件のPDF` });
    } catch (error) {
      setJob({ running: false, message: error instanceof Error ? error.message : "PDF検索失敗" });
    }
  }

  async function addTemplate() {
    const template = createTemplate(newTemplateName, newDocumentType);
    const saved = await api.saveTemplate(template);
    setTemplates((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
    setActiveTemplateId(saved.id);
    setSelectedFieldId(undefined);
  }

  function updateActiveTemplate(updater: (template: OcrTemplate) => OcrTemplate) {
    if (!activeTemplate) {
      return;
    }
    const updated = { ...updater(activeTemplate), updatedAt: nowIso() };
    setTemplates((current) => current.map((template) => (template.id === updated.id ? updated : template)));
  }

  async function saveActiveTemplate() {
    if (!activeTemplate) {
      return;
    }
    setJob({ running: true, message: "フォーマット保存中" });
    try {
      const saved = await api.saveTemplate(activeTemplate);
      setTemplates((current) => current.map((template) => (template.id === saved.id ? saved : template)));
      setJob({ running: false, message: "フォーマット保存済み" });
    } catch (error) {
      setJob({ running: false, message: error instanceof Error ? error.message : "保存失敗" });
    }
  }

  async function deleteActiveTemplate() {
    if (!activeTemplate) {
      return;
    }
    await api.deleteTemplate(activeTemplate.id);
    setTemplates((current) => current.filter((template) => template.id !== activeTemplate.id));
    setAssignments((current) => {
      const next = { ...current };
      for (const [fileId, templateId] of Object.entries(next)) {
        if (templateId === activeTemplate.id) {
          delete next[fileId];
        }
      }
      return next;
    });
    setActiveTemplateId(undefined);
    setSelectedFieldId(undefined);
  }

  function assignTemplate(fileId: string, templateId: string) {
    setAssignments((current) => ({ ...current, [fileId]: templateId }));
    if (fileId === selectedFileId) {
      setActiveTemplateId(templateId);
    }
  }

  function selectFile(file: PdfFile) {
    setSelectedFileId(file.id);
    const assignedTemplateId = assignments[file.id];
    if (assignedTemplateId) {
      setActiveTemplateId(assignedTemplateId);
    }
  }

  function addField(field: OcrField) {
    updateActiveTemplate((template) => ({
      ...template,
      fields: [...template.fields, field]
    }));
    setSelectedFieldId(field.id);
  }

  function updateSelectedField(patch: Partial<OcrField>) {
    if (!selectedField) {
      return;
    }
    updateActiveTemplate((template) => ({
      ...template,
      fields: template.fields.map((field) =>
        field.id === selectedField.id ? { ...field, ...patch } : field
      )
    }));
  }

  function updateFieldRect(fieldId: string, rect: NormalizedRect) {
    updateActiveTemplate((template) => ({
      ...template,
      fields: template.fields.map((field) =>
        field.id === fieldId ? { ...field, rect } : field
      )
    }));
  }

  function deleteSelectedField() {
    if (!selectedField) {
      return;
    }
    updateActiveTemplate((template) => ({
      ...template,
      fields: template.fields.filter((field) => field.id !== selectedField.id)
    }));
    setSelectedFieldId(undefined);
  }

  async function extractFiles(targetFiles: PdfFile[]) {
    if (targetFiles.length === 0 || job.running) {
      return;
    }

    setJob({ running: true, message: "OCR初期化中", progress: 0 });
    const worker = await createOcrWorker((message, progress) =>
      setJob({ running: true, message, progress })
    );

    try {
      const nextExtractions: Record<string, ExtractionDocument> = {};
      for (const file of targetFiles) {
        const template = templates.find((item) => item.id === assignments[file.id]);
        if (!template) {
          continue;
        }

        setJob({ running: true, message: `${file.name} OCR中`, progress: 0 });
        const recognizedFields = await recognizeTemplateFields({
          file,
          template,
          worker,
          onProgress: (message, progress) => setJob({ running: true, message, progress })
        });
        nextExtractions[file.id] = buildExtractionDocument({
          sourceFile: file,
          template,
          extractedAt: nowIso(),
          recognizedFields
        });
      }

      setExtractions((current) => ({ ...current, ...nextExtractions }));
      setJob({ running: false, message: `${Object.keys(nextExtractions).length}件 OCR完了` });
    } catch (error) {
      setJob({ running: false, message: error instanceof Error ? error.message : "OCR失敗" });
    } finally {
      await worker.terminate();
    }
  }

  async function saveJson() {
    const documents = Object.values(extractions);
    if (documents.length === 0) {
      return;
    }

    setJob({ running: true, message: "JSON保存中" });
    try {
      const result = await api.saveExtractions(outputDir, documents);
      setOutputDir(result.outputDir);
      setJob({ running: false, message: `${result.written.length}件保存` });
    } catch (error) {
      setJob({ running: false, message: error instanceof Error ? error.message : "JSON保存失敗" });
    }
  }

  async function saveCsv() {
    const documents = Object.values(extractions);
    if (documents.length === 0) {
      return;
    }

    setJob({ running: true, message: "CSV保存中" });
    try {
      const result = await api.saveExtractionsCsv(outputDir, documents);
      setOutputDir(result.outputDir);
      setJob({ running: false, message: `${result.rows}行CSV保存` });
    } catch (error) {
      setJob({ running: false, message: error instanceof Error ? error.message : "CSV保存失敗" });
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
            <ScanText size={26} />
          <div>
            <h1>PDFreader OCR</h1>
            <p>矩形フォーマットからJSON/CSVを生成</p>
          </div>
        </div>
        <div className="status-strip">
          {job.running ? <Loader2 className="spin" size={16} /> : <Archive size={16} />}
          <span>{job.message}</span>
          {typeof job.progress === "number" ? (
            <progress value={job.progress} max={1} aria-label="OCR progress" />
          ) : null}
        </div>
      </header>

      <section className="command-bar">
        <label className="path-input">
          <span>PDFフォルダ</span>
          <input
            value={rootDir}
            onChange={(event) => setRootDir(event.target.value)}
            placeholder="C:\\Users\\stell\\Documents\\orders"
          />
        </label>
        <button type="button" onClick={scanFolder} disabled={!rootDir.trim() || job.running}>
          <FolderOpen size={17} />
          検索
        </button>
        <label className="path-input">
          <span>出力先</span>
          <input
            value={outputDir}
            onChange={(event) => setOutputDir(event.target.value)}
            placeholder="未指定なら data\\output"
          />
        </label>
        <button type="button" onClick={() => extractFiles(readyFiles)} disabled={!readyFiles.length || job.running}>
          <Play size={17} />
          割当済み一括OCR
        </button>
        <button type="button" onClick={saveJson} disabled={!Object.keys(extractions).length || job.running}>
          <Save size={17} />
          JSON保存
        </button>
        <button type="button" onClick={saveCsv} disabled={!Object.keys(extractions).length || job.running}>
          <Save size={17} />
          CSV保存
        </button>
      </section>

      <div className="workspace-grid">
        <section className="panel file-panel">
          <div className="panel-header">
            <div>
              <h2>PDF一覧</h2>
              <p>{files.length}件 / フォーマット割当 {assignedCount}件</p>
            </div>
            <FileSearch size={20} />
          </div>
          <div className="file-list">
            {files.map((file) => (
              <div key={file.id} className={file.id === selectedFileId ? "file-row active" : "file-row"}>
                <button className="file-open" type="button" onClick={() => selectFile(file)}>
                  <span className="file-name">{file.relativePath}</span>
                </button>
                <select
                  value={assignments[file.id] ?? ""}
                  onChange={(event) => assignTemplate(file.id, event.target.value)}
                >
                  <option value="">未選択</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <span className={extractions[file.id] ? "pill done" : "pill"}>{extractions[file.id] ? "JSON済" : "未OCR"}</span>
              </div>
            ))}
            {files.length === 0 ? <p className="empty-text">PDFがありません</p> : null}
          </div>
        </section>

        <PdfPreview
          file={selectedFile}
          template={activeTemplate}
          selectedFieldId={selectedFieldId}
          onSelectField={setSelectedFieldId}
          onAddField={addField}
          onUpdateFieldRect={updateFieldRect}
        />

        <aside className="panel template-panel">
          <div className="panel-header">
            <div>
              <h2>フォーマット</h2>
              <p>{activeTemplate?.fields.length ?? 0}項目</p>
            </div>
          </div>

          <div className="stack">
            <label>
              <span>新規名</span>
              <input value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} />
            </label>
            <label>
              <span>文書種別</span>
              <select value={newDocumentType} onChange={(event) => setNewDocumentType(event.target.value)}>
                <option value="quote_request">見積依頼書</option>
                <option value="quote">見積書</option>
                <option value="purchase_order">注文書</option>
                <option value="order_confirmation">注文請書</option>
                <option value="document">その他</option>
              </select>
            </label>
            <button type="button" onClick={addTemplate}>
              <Archive size={17} />
              作成
            </button>
          </div>

          <div className="template-select">
            <label>
              <span>選択中</span>
              <select
                value={activeTemplateId ?? ""}
                onChange={(event) => {
                  setActiveTemplateId(event.target.value || undefined);
                  setSelectedFieldId(undefined);
                }}
              >
                <option value="">未選択</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {activeTemplate ? (
            <>
              <label>
                <span>フォーマット名</span>
                <input
                  value={activeTemplate.name}
                  onChange={(event) =>
                    updateActiveTemplate((template) => ({ ...template, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>文書種別</span>
                <input
                  value={activeTemplate.documentType}
                  onChange={(event) =>
                    updateActiveTemplate((template) => ({ ...template, documentType: event.target.value }))
                  }
                />
              </label>
              <div className="button-row">
                <button type="button" onClick={saveActiveTemplate}>
                  <Save size={17} />
                  保存
                </button>
                <button className="danger" type="button" onClick={deleteActiveTemplate}>
                  <Trash2 size={17} />
                  削除
                </button>
              </div>

              <div className="field-list">
                {activeTemplate.fields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    className={field.id === selectedFieldId ? "field-row active" : "field-row"}
                    onClick={() => setSelectedFieldId(field.id)}
                  >
                    <span>{field.tag}</span>
                    <small>p.{field.pageNumber}</small>
                  </button>
                ))}
              </div>

              {selectedField ? (
                <div className="field-editor">
                  <label>
                    <span>タグ</span>
                    <input
                      value={selectedField.tag}
                      onChange={(event) => updateSelectedField({ tag: event.target.value })}
                    />
                  </label>
                  <button className="danger secondary" type="button" onClick={deleteSelectedField}>
                    <Trash2 size={17} />
                    項目削除
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="empty-text">フォーマット未選択</p>
          )}

          <div className="button-row extraction-actions">
            <button
              type="button"
              disabled={!selectedFile || !assignments[selectedFile.id] || job.running}
              onClick={() => (selectedFile ? extractFiles([selectedFile]) : undefined)}
            >
              <Play size={17} />
              選択PDF OCR
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
