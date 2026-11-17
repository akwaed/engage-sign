import { PDFDocument } from 'pdf-lib';

export const MAX_TEMPLATE_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_TEMPLATE_PDF_PAGES = 30;

export function assertPdfUpload(bytes: Uint8Array) {
  if (bytes.length < 32 || bytes.length > MAX_TEMPLATE_PDF_BYTES)
    throw new Error('PDF templates must be between 32 bytes and 20 MB.');
  if (
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  )
    throw new Error('The uploaded file is not a PDF.');
}

export async function sanitizeTemplatePdf(bytes: Uint8Array) {
  assertPdfUpload(bytes);
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const pageCount = source.getPageCount();
  if (pageCount < 1 || pageCount > MAX_TEMPLATE_PDF_PAGES)
    throw new Error(
      `PDF templates must have 1 to ${MAX_TEMPLATE_PDF_PAGES} pages.`,
    );
  const clean = await PDFDocument.create();
  const pages = await clean.copyPages(source, source.getPageIndices());
  for (const page of pages) clean.addPage(page);
  const saved = await clean.save();
  return {
    bytes: saved,
    pageCount,
    pageSizes: pages.map((page) => page.getSize()),
  };
}
