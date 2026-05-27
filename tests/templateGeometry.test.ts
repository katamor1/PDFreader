import { describe, expect, it } from "vitest";

import {
  createFieldFromDrag,
  fromNormalizedRect,
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
});
