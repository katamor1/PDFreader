export type ParsedRange = {
  start: number;
  end: number;
  contentLength: number;
};

export function parseRangeHeader(header: string | undefined, fileSize: number): ParsedRange | undefined {
  if (!header) {
    return undefined;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) {
    return undefined;
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return undefined;
  }

  let start: number;
  let end: number;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return undefined;
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : fileSize - 1;
  }

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return undefined;
  }

  end = Math.min(end, fileSize - 1);

  return {
    start,
    end,
    contentLength: end - start + 1
  };
}
