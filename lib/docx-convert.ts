import 'server-only';

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function convertDocxToPdf(bytes: Uint8Array) {
  const executable = process.env.LIBREOFFICE_BIN?.trim() || 'soffice';
  const directory = await mkdtemp(join(tmpdir(), 'engage-docx-'));
  try {
    const source = join(directory, 'input.docx');
    await writeFile(source, bytes);
    await new Promise<void>((resolve, reject) => {
      const lock = process.env.CONVERSION_LOCK_PATH;
      const child = spawn(
        lock ? '/usr/bin/flock' : executable,
        [
          ...(lock ? ['--wait', '30', lock, executable] : []),
          '-env:UserInstallation=' +
            pathToFileURL(join(directory, 'profile')).href,
          '--headless',
          '--convert-to',
          'pdf:writer_pdf_Export',
          '--outdir',
          directory,
          source,
        ],
        {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
          detached: process.platform === 'linux',
        },
      );
      const timer = setTimeout(() => {
        if (process.platform === 'linux' && child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {}
        } else child.kill();
      }, 90_000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(
          'code' in error && error.code === 'ENOENT'
            ? new Error(
                'LibreOffice is unavailable on this host. Install soffice or set LIBREOFFICE_BIN to its absolute path.',
              )
            : error,
        );
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
