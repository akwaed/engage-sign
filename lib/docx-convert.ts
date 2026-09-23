import 'server-only';

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function convertDocxToPdf(bytes: Uint8Array) {
  const executable = process.env.LIBREOFFICE_BIN;
  if (!executable)
    throw new Error(
      'DOCX PDF conversion requires LIBREOFFICE_BIN on this host.',
    );
  const directory = await mkdtemp(join(tmpdir(), 'engage-docx-'));
  try {
    const source = join(directory, 'input.docx');
    await writeFile(source, bytes);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        executable,
        [
          '-env:UserInstallation=file:///' +
            directory.replace(/\\/g, '/') +
            '/profile',
          '--headless',
          '--convert-to',
          'pdf:writer_pdf_Export',
          '--outdir',
          directory,
          source,
        ],
        { shell: false, windowsHide: true, stdio: 'ignore' },
      );
      const timer = setTimeout(() => child.kill(), 60_000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error('DOCX PDF conversion failed.'));
      });
    });
    const pdf = new Uint8Array(await readFile(join(directory, 'input.pdf')));
    if (
      pdf.length < 5 ||
      String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-'
    )
      throw new Error('Conversion did not produce a PDF.');
    return pdf;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
