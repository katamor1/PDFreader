import type { CanvasSize, NormalizedRect, OcrField, RenderedRect } from "./types";

export type ResizeHandle = "nw" | "ne" | "sw" | "se";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const round = (value: number) => Number(value.toFixed(6));

export function toNormalizedRect(
  rect: RenderedRect,
  canvasSize: CanvasSize
): NormalizedRect {
  return {
    x: round(clamp(rect.x / canvasSize.width, 0, 1)),
    y: round(clamp(rect.y / canvasSize.height, 0, 1)),
    width: round(clamp(rect.width / canvasSize.width, 0, 1)),
    height: round(clamp(rect.height / canvasSize.height, 0, 1))
  };
}

export function fromNormalizedRect(
  rect: NormalizedRect,
  canvasSize: CanvasSize
): RenderedRect {
  return {
    x: Math.round(rect.x * canvasSize.width),
    y: Math.round(rect.y * canvasSize.height),
    width: Math.round(rect.width * canvasSize.width),
    height: Math.round(rect.height * canvasSize.height)
  };
}

export function createFieldFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  canvasSize: CanvasSize,
  tag: string,
  pageNumber: number
): OcrField {
  const left = clamp(Math.min(start.x, end.x), 0, canvasSize.width);
  const top = clamp(Math.min(start.y, end.y), 0, canvasSize.height);
  const right = clamp(Math.max(start.x, end.x), 0, canvasSize.width);
  const bottom = clamp(Math.max(start.y, end.y), 0, canvasSize.height);

  return {
    id: crypto.randomUUID(),
    tag,
    pageNumber,
    rect: toNormalizedRect(
      { x: left, y: top, width: right - left, height: bottom - top },
      canvasSize
    )
  };
}

export function moveNormalizedRect(
  rect: NormalizedRect,
  delta: { x: number; y: number },
  canvasSize: CanvasSize
): NormalizedRect {
  const rendered = fromNormalizedRect(rect, canvasSize);
  const nextX = clamp(rendered.x + delta.x, 0, canvasSize.width - rendered.width);
  const nextY = clamp(rendered.y + delta.y, 0, canvasSize.height - rendered.height);

  return toNormalizedRect(
    {
      ...rendered,
      x: nextX,
      y: nextY
    },
    canvasSize
  );
}

export function resizeNormalizedRect(
  rect: NormalizedRect,
  handle: ResizeHandle,
  delta: { x: number; y: number },
  canvasSize: CanvasSize,
  minPixels = 12
): NormalizedRect {
  const rendered = fromNormalizedRect(rect, canvasSize);
  let left = rendered.x;
  let top = rendered.y;
  let right = rendered.x + rendered.width;
  let bottom = rendered.y + rendered.height;

  if (handle.includes("w")) {
    left = clamp(left + delta.x, 0, right - minPixels);
  }
  if (handle.includes("e")) {
    right = clamp(right + delta.x, left + minPixels, canvasSize.width);
  }
  if (handle.includes("n")) {
    top = clamp(top + delta.y, 0, bottom - minPixels);
  }
  if (handle.includes("s")) {
    bottom = clamp(bottom + delta.y, top + minPixels, canvasSize.height);
  }

  return toNormalizedRect(
    {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top
    },
    canvasSize
  );
}
