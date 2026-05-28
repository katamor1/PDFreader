import { describe, expect, it } from "vitest";

import {
  createFieldFromDrag,
  fromNormalizedRect,
  moveNormalizedRect,
  resizeNormalizedRect,
  toNormalizedRect
} from "../src/lib/templateGeometry";

describe("template geometry", () => {
  it("converts rendered canvas rectangles into normalized template rectangles", () => {
    expect(
      toNormalizedRect(
        { x: 100, y: 50, width: 200, height: 150 },
        { width: 1000, height: 500 }
      )
    ).toEqual({ x: 0.1, y: 0.1, width: 0.2, height: 0.3 });
  });

  it("converts normalized template rectangles back to rendered canvas rectangles", () => {
    expect(
      fromNormalizedRect(
        { x: 0.25, y: 0.1, width: 0.5, height: 0.3 },
        { width: 800, height: 600 }
      )
    ).toEqual({ x: 200, y: 60, width: 400, height: 180 });
  });

  it("creates a field from a reverse drag and clamps it inside the page", () => {
    const field = createFieldFromDrag(
      { x: 420, y: 160 },
      { x: 120, y: 40 },
      { width: 600, height: 400 },
      "amount",
      1
    );

    expect(field.tag).toBe("amount");
    expect(field.pageNumber).toBe(1);
    expect(field.rect).toEqual({ x: 0.2, y: 0.1, width: 0.5, height: 0.3 });
  });

  it("moves an existing normalized rectangle without letting it leave the page", () => {
    expect(
      moveNormalizedRect(
        { x: 0.7, y: 0.7, width: 0.2, height: 0.2 },
        { x: 200, y: 120 },
        { width: 1000, height: 500 }
      )
    ).toEqual({ x: 0.8, y: 0.8, width: 0.2, height: 0.2 });
  });

  it("resizes an existing rectangle from a corner handle", () => {
    expect(
      resizeNormalizedRect(
        { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
        "se",
        { x: 100, y: 50 },
        { width: 1000, height: 500 }
      )
    ).toEqual({ x: 0.2, y: 0.2, width: 0.4, height: 0.3 });
  });

  it("keeps resized rectangles above the minimum visible size", () => {
    expect(
      resizeNormalizedRect(
        { x: 0.2, y: 0.2, width: 0.3, height: 0.2 },
        "nw",
        { x: 400, y: 200 },
        { width: 1000, height: 500 },
        20
      )
    ).toEqual({ x: 0.48, y: 0.36, width: 0.02, height: 0.04 });
  });
});
