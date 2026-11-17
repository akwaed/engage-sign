import { createHash } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type TemplateField = {
  fieldName: string;
  label: string;
  fieldType:
    | 'text'
    | 'multiline'
    | 'date'
    | 'checkbox'
    | 'radio'
    | 'dropdown'
    | 'initials'
    | 'signature'
    | 'email'
    | 'phone';
  populatedBy: 'admin-fill' | 'participant-fill' | 'signer' | 'system';
  signerRole: string;
  pageNumber: number | null;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  required: boolean;
  groupKey?: string | null;
  options?: string[];
  dateFormat?: string | null;
};

export function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function inspectTemplate(bytes: Uint8Array, type: 'docx' | 'pdf') {
  if (bytes.length < 32 || bytes.length > 20 * 1024 * 1024)
    throw new Error('Template files must be between 32 bytes and 20 MB.');
  if (type === 'pdf') {
    if (strFromU8(bytes.subarray(0, 5)) !== '%PDF-')
      throw new Error('The uploaded file is not a PDF.');
    const document = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return { pageCount: document.getPageCount(), placeholders: [] as string[] };
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error('The uploaded file is not a DOCX archive.');
  const entries = unzipSync(bytes, {
    filter: (entry) =>
      entry.name === '[Content_Types].xml' ||
      /^word\/(document|header\d+|footer\d+)\.xml$/.test(entry.name),
  });
  if (!entries['[Content_Types].xml'] || !entries['word/document.xml'])
    throw new Error('The DOCX is missing required Office XML parts.');
  const text = Object.values(entries)
    .map((entry) => strFromU8(entry))
    .join('\n');
  const placeholders = [...text.matchAll(/\{\{([a-z][a-z0-9_]*)\}\}/gi)].map(
    (match) => match[1],
  );
  return { pageCount: null, placeholders: [...new Set(placeholders)] };
}

export function mergeDocx(bytes: Uint8Array, values: Record<string, string>) {
  const entries = unzipSync(bytes);
  const used = new Set<string>();
  for (const [name, data] of Object.entries(entries)) {
    if (!/^word\/(document|header\d+|footer\d+)\.xml$/.test(name)) continue;
    const xml = strFromU8(data).replace(
      /\{\{([a-z][a-z0-9_]*)\}\}/gi,
      (whole, field: string) => {
        if (!(field in values)) return whole;
        used.add(field);
        return escapeXml(values[field]);
      },
    );
    entries[name] = strToU8(xml);
  }
  for (const key of Object.keys(values))
    if (!used.has(key))
      throw new Error(`DOCX placeholder {{${key}}} is missing.`);
  return zipSync(entries, { level: 6 });
}

export async function fillPdf(
  bytes: Uint8Array,
  fields: TemplateField[],
  values: Record<string, string>,
  coordinateSpace: 'grid1000' | 'pdf_points' = 'grid1000',
) {
  const document = await PDFDocument.load(bytes);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const field of fields) {
    const value = values[field.fieldName];
    if (value === undefined || !value) continue;
    if (
      !field.pageNumber ||
      field.x === null ||
      field.y === null ||
      field.width === null ||
      field.height === null
    )
      throw new Error(`Field ${field.fieldName} has no PDF coordinates.`);
    const page = document.getPage(field.pageNumber - 1);
    const { width, height } = page.getSize();
    const placed =
      coordinateSpace === 'pdf_points'
        ? {
            x: field.x,
            y: height - field.y - field.height,
            boxWidth: field.width,
            boxHeight: field.height,
          }
        : {
            x: (field.x / 1000) * width,
            y: height - ((field.y + field.height) / 1000) * height,
            boxWidth: (field.width / 1000) * width,
            boxHeight: (field.height / 1000) * height,
          };
    if (field.fieldType === 'checkbox' || field.fieldType === 'radio') {
      if (/^(true|yes|on|1|checked)$/i.test(value))
        page.drawText('X', {
          x: placed.x,
          y: placed.y,
          size: Math.min(placed.boxHeight, 16),
          font,
          color: rgb(0, 0, 0),
        });
      continue;
    }
    const display = value.slice(0, 2000);
    const size = Math.min(11, Math.max(5, placed.boxHeight * 0.45));
    drawWrapped(
      page,
      font,
      display,
      placed.x,
      placed.y + placed.boxHeight - size,
      placed.boxWidth,
      placed.boxHeight,
      size,
      field.fieldType === 'multiline',
    );
  }
  return document.save();
}

function drawWrapped(
  page: ReturnType<PDFDocument['getPage']>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  text: string,
  x: number,
  top: number,
  boxWidth: number,
  boxHeight: number,
  size: number,
  wrap: boolean,
) {
  const lines: string[] = [];
  if (!wrap) lines.push(text);
  else {
    let current = '';
    for (const word of text.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > boxWidth && current) {
        lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
  }
  const lineHeight = size + 2;
  lines
    .slice(0, Math.max(1, Math.floor(boxHeight / lineHeight)))
    .forEach((line, index) => {
      page.drawText(line, {
        x,
        y: top - index * lineHeight,
        size,
        font,
        color: rgb(0, 0, 0),
        maxWidth: boxWidth,
      });
    });
}

export async function drawSignatureImages(
  bytes: Uint8Array,
  fields: TemplateField[],
  png: Uint8Array,
) {
  const document = await PDFDocument.load(bytes);
  const image = await document.embedPng(png);
  for (const field of fields.filter((item) => item.fieldType === 'signature')) {
    if (
      !field.pageNumber ||
      field.x === null ||
      field.y === null ||
      field.width === null ||
      field.height === null
    )
      continue;
    const page = document.getPage(field.pageNumber - 1);
    const { width, height } = page.getSize();
    const boxWidth = (field.width / 1000) * width;
    const boxHeight = (field.height / 1000) * height;
    const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
    page.drawImage(image, {
      x: (field.x / 1000) * width,
      y: height - ((field.y + field.height) / 1000) * height,
      width: image.width * scale,
      height: image.height * scale,
    });
  }
  return document.save();
}

export async function appendSignatureEvidence(
  bytes: Uint8Array,
  evidence: {
    name: string;
    role: string;
    signedAt: string;
    presentedHash: string;
    method: 'typed' | 'drawn';
    png?: Uint8Array;
  },
) {
  const document = await PDFDocument.load(bytes);
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  const lines = [
    'Electronic signature evidence',
    `Signer: ${pdfSafeText(font, evidence.name)}`,
    `Role: ${pdfSafeText(font, evidence.role)}`,
    `Signer name SHA-256: ${sha256(new TextEncoder().encode(evidence.name))}`,
    `Signed at (UTC): ${evidence.signedAt}`,
    `Method: ${evidence.method}`,
    'Presented document SHA-256:',
    evidence.presentedHash,
  ];
  lines.forEach((line, index) =>
    page.drawText(line, {
      x: 54,
      y: 735 - index * 28,
      size: index === 0 ? 18 : 11,
      font,
    }),
  );
  if (evidence.png) {
    const image = await document.embedPng(evidence.png);
    const scale = Math.min(400 / image.width, 160 / image.height);
    page.drawImage(image, {
      x: 54,
      y: 340,
      width: image.width * scale,
      height: image.height * scale,
    });
  }
  return document.save();
}

function pdfSafeText(
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  value: string,
) {
  let safe = '';
  for (const character of value) {
    try {
      font.encodeText(character);
      safe += character;
    } catch {
      safe += '?';
    }
  }
  return safe;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
