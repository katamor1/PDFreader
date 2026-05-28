import { describe, expect, it } from "vitest";

import { applyBlackWhiteContrast, calculateOtsuThreshold } from "../src/lib/imagePreprocessing";

function imageDataFromGrays(values: number[]) {
  const data = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, index) => {
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = index === 0 ? 128 : 255;
  });

  return new ImageData(data, values.length, 1);
}

describe("image preprocessing", () => {
  it("calculates a threshold between dark text and bright paper", () => {
    const image = imageDataFromGrays([28, 35, 42, 190, 220, 245]);

    expect(calculateOtsuThreshold(image)).toBeGreaterThanOrEqual(42);
    expect(calculateOtsuThreshold(image)).toBeLessThan(190);
  });

  it("converts OCR crops to strict black and white pixels while preserving alpha", () => {
    const image = imageDataFromGrays([35, 95, 160, 230]);
    const processed = applyBlackWhiteContrast(image, { threshold: 150 });
    const pixels = Array.from(processed.data);

    expect(pixels).toEqual([
      0, 0, 0, 128,
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);
  });

  it("uses a darker threshold bias so faint scan text is kept black", () => {
    const image = imageDataFromGrays([80, 135, 170, 235]);
    const processed = applyBlackWhiteContrast(image, { threshold: 160, thresholdBias: 20 });

    expect(Array.from(processed.data.slice(0, 12))).toEqual([
      0, 0, 0, 128,
      0, 0, 0, 255,
      0, 0, 0, 255
    ]);
  });

  it("keeps faint text black even when a dark ruled line is also in the crop", () => {
    const image = imageDataFromGrays([35, 170, 235, 245]);
    const processed = applyBlackWhiteContrast(image);

    expect(Array.from(processed.data)).toEqual([
      0, 0, 0, 128,
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255
    ]);
  });
});
