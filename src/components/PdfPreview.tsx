import { ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fromNormalizedRect, createFieldFromDrag } from "../lib/templateGeometry";
import { loadPdf } from "../lib/pdfOcr";
import type { CanvasSize, OcrField, OcrTemplate, PdfFile, RenderedRect } from "../lib/types";

type Props = {
  file?: PdfFile;
  template?: OcrTemplate;
  selectedFieldId?: string;
  onSelectField: (fieldId: string) => void;
  onAddField: (field: OcrField) => void;
};

type DragState = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

export function PdfPreview({
  file,
  template,
  selectedFieldId,
  onSelectField,
  onAddField
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<SVGSVGElement | null>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [status, setStatus] = useState("PDF未選択");
  const [drag, setDrag] = useState<DragState | null>(null);

  useEffect(() => {
    setPageNumber(1);
  }, [file?.id]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!file || !canvas || !context) {
        setStatus("PDF未選択");
        setCanvasSize({ width: 0, height: 0 });
        return;
      }

      try {
        setStatus("PDF読込中");
        const pdf = await loadPdf(file);
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        const safePageNumber = Math.min(pageNumber, pdf.numPages);
        const pageCount = pdf.numPages;
        const page = await pdf.getPage(safePageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const maxWidth = Math.min(980, canvas.parentElement?.clientWidth ?? 980);
        const scale = Math.max(0.5, Math.min(1.6, maxWidth / baseViewport.width));
        const viewport = page.getViewport({ scale });
        const ratio = window.devicePixelRatio || 1;

        canvas.width = Math.ceil(viewport.width * ratio);
        canvas.height = Math.ceil(viewport.height * ratio);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.fillStyle = "#fff";
        context.fillRect(0, 0, viewport.width, viewport.height);
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        await pdf.destroy();

        if (!cancelled) {
          setPageCount(pageCount);
          setPageNumber(safePageNumber);
          setCanvasSize({ width: viewport.width, height: viewport.height });
          setStatus(`${safePageNumber} / ${pdf.numPages}`);
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : "PDF読込失敗");
        }
      }
    }

    void render();

    return () => {
      cancelled = true;
    };
  }, [file, pageNumber]);

  const visibleFields = useMemo(() => {
    if (!template || canvasSize.width === 0 || canvasSize.height === 0) {
      return [];
    }

    return template.fields
      .filter((field) => field.pageNumber === pageNumber)
      .map((field) => ({
        field,
        rect: fromNormalizedRect(field.rect, canvasSize)
      }));
  }, [canvasSize, pageNumber, template]);

  const draftRect = useMemo<RenderedRect | null>(() => {
    if (!drag) {
      return null;
    }

    const left = Math.min(drag.start.x, drag.current.x);
    const top = Math.min(drag.start.y, drag.current.y);
    return {
      x: left,
      y: top,
      width: Math.abs(drag.current.x - drag.start.x),
      height: Math.abs(drag.current.y - drag.start.y)
    };
  }, [drag]);

  function pointerPoint(event: React.PointerEvent<SVGSVGElement>) {
    const overlay = overlayRef.current;
    const bounds = overlay?.getBoundingClientRect();
    if (!bounds) {
      return { x: 0, y: 0 };
    }

    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    };
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!template || !file || canvasSize.width === 0 || canvasSize.height === 0) {
      return;
    }

    const target = event.target as SVGElement;
    if (target.dataset.fieldId) {
      onSelectField(target.dataset.fieldId);
      return;
    }

    const point = pointerPoint(event);
    setDrag({ start: point, current: point });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag) {
      return;
    }
    setDrag({ ...drag, current: pointerPoint(event) });
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag || !template) {
      return;
    }

    const point = pointerPoint(event);
    const width = Math.abs(point.x - drag.start.x);
    const height = Math.abs(point.y - drag.start.y);
    setDrag(null);

    if (width < 8 || height < 8) {
      return;
    }

    onAddField(
      createFieldFromDrag(
        drag.start,
        point,
        canvasSize,
        `field_${template.fields.length + 1}`,
        pageNumber
      )
    );
  }

  return (
    <section className="preview-panel panel">
      <div className="panel-header preview-header">
        <div>
          <h2>PDFプレビュー</h2>
          <p>{file?.relativePath ?? "フォルダからPDFを選択"}</p>
        </div>
        <div className="page-controls">
          <button
            className="icon-button"
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
            title="前ページ"
          >
            <ChevronLeft size={18} />
          </button>
          <span>{status}</span>
          <button
            className="icon-button"
            type="button"
            disabled={!pageCount || pageNumber >= pageCount}
            onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}
            title="次ページ"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="pdf-stage">
        <canvas ref={canvasRef} />
        <svg
          ref={overlayRef}
          className="field-overlay"
          style={{ width: canvasSize.width, height: canvasSize.height }}
          viewBox={`0 0 ${canvasSize.width || 1} ${canvasSize.height || 1}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {visibleFields.map(({ field, rect }) => (
            <g key={field.id}>
              <rect
                data-field-id={field.id}
                className={field.id === selectedFieldId ? "field-rect selected" : "field-rect"}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
              />
              <text x={rect.x + 6} y={Math.max(14, rect.y - 6)} className="field-label">
                {field.tag}
              </text>
            </g>
          ))}
          {draftRect ? (
            <rect
              className="field-rect draft"
              x={draftRect.x}
              y={draftRect.y}
              width={draftRect.width}
              height={draftRect.height}
            />
          ) : null}
        </svg>
        {!template ? (
          <div className="empty-preview">
            <Crosshair size={24} />
            <span>フォーマットを作成または選択</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
