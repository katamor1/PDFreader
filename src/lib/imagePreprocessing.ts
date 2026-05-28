export type BlackWhiteContrastOptions = {
  threshold?: number;
  thresholdBias?: number;
  minThreshold?: number;
  maxThreshold?: number;
};

const DEFAULT_THRESHOLD_BIAS = 14;
const DEFAULT_MIN_THRESHOLD = 180;
const DEFAULT_MAX_THRESHOLD = 220;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function grayscale(data: Uint8ClampedArray, index: number) {
  return Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
}

export function calculateOtsuThreshold(image: ImageData): number {
  const histogram = new Array<number>(256).fill(0);
  const totalPixels = image.width * image.height;

  for (let index = 0; index < image.data.length; index += 4) {
    histogram[grayscale(image.data, index)] += 1;
  }

  let totalIntensity = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    totalIntensity += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundIntensity = 0;
  let bestVariance = -1;
  let threshold = 128;

  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value];
    if (backgroundWeight === 0) {
      continue;
    }

    const foregroundWeight = totalPixels - backgroundWeight;
    if (foregroundWeight === 0) {
      break;
    }

    backgroundIntensity += value * histogram[value];
    const backgroundMean = backgroundIntensity / backgroundWeight;
    const foregroundMean = (totalIntensity - backgroundIntensity) / foregroundWeight;
    const variance =
      backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;

    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = value;
    }
  }

  return threshold;
}

export function applyBlackWhiteContrast(
  image: ImageData,
  options: BlackWhiteContrastOptions = {}
): ImageData {
  const isAutoThreshold = options.threshold === undefined;
  const minThreshold = options.minThreshold ?? (isAutoThreshold ? DEFAULT_MIN_THRESHOLD : 0);
  const maxThreshold = options.maxThreshold ?? (isAutoThreshold ? DEFAULT_MAX_THRESHOLD : 255);
  const thresholdBias =
    options.thresholdBias ?? (isAutoThreshold ? DEFAULT_THRESHOLD_BIAS : 0);
  const threshold = clamp(
    (options.threshold ?? calculateOtsuThreshold(image)) + thresholdBias,
    minThreshold,
    maxThreshold
  );
  const output = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);

  for (let index = 0; index < output.data.length; index += 4) {
    const value = grayscale(output.data, index) <= threshold ? 0 : 255;
    output.data[index] = value;
    output.data[index + 1] = value;
    output.data[index + 2] = value;
  }

  return output;
}
