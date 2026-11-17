export type PdfPointBox = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PageSize = { width: number; height: number };

export function toPdfLibRect(box: PdfPointBox, page: PageSize) {
  return {
    x: roundPoint(box.x),
    y: roundPoint(page.height - box.y - box.height),
    width: roundPoint(box.width),
    height: roundPoint(box.height),
  };
}

export function fromPdfLibRect(
  rect: { x: number; y: number; width: number; height: number },
  page: PageSize,
  pageNumber: number,
): PdfPointBox {
  return {
    page: pageNumber,
    x: roundPoint(rect.x),
    y: roundPoint(page.height - rect.y - rect.height),
    width: roundPoint(rect.width),
    height: roundPoint(rect.height),
  };
}

export function normalizeBox(box: PdfPointBox, page: PageSize) {
  return {
    page: box.page,
    x: box.x / page.width,
    y: box.y / page.height,
    width: box.width / page.width,
    height: box.height / page.height,
  };
}

export function denormalizeBox(
  box: ReturnType<typeof normalizeBox>,
  page: PageSize,
): PdfPointBox {
  return {
    page: box.page,
    x: roundPoint(box.x * page.width),
    y: roundPoint(box.y * page.height),
    width: roundPoint(box.width * page.width),
    height: roundPoint(box.height * page.height),
  };
}

export function snapBox(
  box: PdfPointBox,
  others: PdfPointBox[],
  page: PageSize,
  threshold = 4,
) {
  const guides: Array<{ axis: 'x' | 'y'; at: number }> = [];
  let x = box.x;
  let y = box.y;
  const vertical = [0, page.width / 2 - box.width / 2, page.width - box.width];
  const horizontal = [
    0,
    page.height / 2 - box.height / 2,
    page.height - box.height,
  ];
  for (const other of others) {
    if (other.page !== box.page) continue;
    vertical.push(
      other.x,
      other.x + other.width - box.width,
      other.x + other.width,
    );
    horizontal.push(
      other.y,
      other.y + other.height - box.height,
      other.y + other.height,
    );
  }
  const snappedX = nearest(x, vertical, threshold);
  const snappedY = nearest(y, horizontal, threshold);
  if (snappedX !== null) {
    x = snappedX;
    guides.push({ axis: 'x', at: snappedX });
  }
  if (snappedY !== null) {
    y = snappedY;
    guides.push({ axis: 'y', at: snappedY });
  }
  return { box: { ...box, x: roundPoint(x), y: roundPoint(y) }, guides };
}

export function nudgeBox(
  box: PdfPointBox,
  key: string,
  shift: boolean,
  alt: boolean,
  page: PageSize,
) {
  const step = shift ? 10 : 1;
  const next = { ...box };
  const grow = alt;
  if (key === 'ArrowLeft') {
    if (grow) next.width = Math.max(8, next.width - step);
    else next.x -= step;
  } else if (key === 'ArrowRight') {
    if (grow) next.width += step;
    else next.x += step;
  } else if (key === 'ArrowUp') {
    if (grow) next.height = Math.max(8, next.height - step);
    else next.y -= step;
  } else if (key === 'ArrowDown') {
    if (grow) next.height += step;
    else next.y += step;
  } else return box;
  next.x = clamp(next.x, 0, page.width - 8);
  next.y = clamp(next.y, 0, page.height - 8);
  next.width = clamp(next.width, 8, page.width - next.x);
  next.height = clamp(next.height, 8, page.height - next.y);
  return {
    ...next,
    x: roundPoint(next.x),
    y: roundPoint(next.y),
    width: roundPoint(next.width),
    height: roundPoint(next.height),
  };
}

function nearest(value: number, targets: number[], threshold: number) {
  let best: number | null = null;
  let distance = threshold + 1;
  for (const target of targets) {
    const delta = Math.abs(value - target);
    if (delta <= threshold && delta < distance) {
      best = target;
      distance = delta;
    }
  }
  return best;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function roundPoint(value: number) {
  return Math.round(value * 100) / 100;
}
