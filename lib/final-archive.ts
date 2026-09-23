import { createHash } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export type ArchiveVersion = {
  id: string;
  kind: 'prepared' | 'presented' | 'intermediate' | 'final';
  hash: string;
  bytes: Uint8Array;
};

export type ArchiveSignerEvent = {
  signerId: string;
  name: string;
  role: string;
  signedAt: string;
  method: 'typed' | 'drawn';
  consentVersion: string;
  presentedHash: string;
};

export type FinalArchiveInput = {
  envelopeId: string;
  completedAt: string;
  versions: ArchiveVersion[];
  events: ArchiveSignerEvent[];
};

export async function buildFinalArchive(input: FinalArchiveInput) {
  if (!input.events.length) throw new Error('A final archive needs signer evidence.');
  const final = input.versions.find((version) => version.kind === 'final');
  if (!final) throw new Error('A final PDF is required.');
  for (const version of input.versions) {
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(version.id))
      throw new Error('A document version ID is invalid.');
    if (sha256(version.bytes) !== version.hash)
      throw new Error(`Document version ${version.id} failed SHA-256 verification.`);
    if (String.fromCharCode(...version.bytes.subarray(0, 5)) !== '%PDF-')
      throw new Error(`Document version ${version.id} is not a PDF.`);
  }
  const certificate = await buildCertificate(input);
  const certificateHash = sha256(certificate);
  const manifest = {
    format: 'engage-sign-final-archive',
    version: 1,
    envelopeId: input.envelopeId,
    completedAt: input.completedAt,
    finalPdfSha256: final.hash,
    certificateSha256: certificateHash,
    documentVersions: input.versions.map(({ id, kind, hash }) => ({
      id,
      kind,
      sha256: hash,
      archivePath: kind === 'final' ? 'final.pdf' : `versions/${id}.pdf`,
    })),
    signerEvents: input.events.map((event) => ({
      signerId: event.signerId,
      role: event.role,
      signedAt: event.signedAt,
      method: event.method,
      consentVersion: event.consentVersion,
      presentedPdfSha256: event.presentedHash,
    })),
  };
  const entries: Record<string, Uint8Array> = {
    'final.pdf': final.bytes,
    'audit-certificate.pdf': certificate,
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2) + '\n'),
  };
  for (const version of input.versions)
    if (version.kind !== 'final')
      entries[`versions/${version.id}.pdf`] = version.bytes;
  const checksums = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, bytes]) => `${sha256(bytes)}  ${name}`)
    .join('\n');
  entries['checksums.sha256'] = strToU8(checksums + '\n');
  const archive = zipSync(entries, { level: 6, mtime: new Date(input.completedAt) });
  verifyFinalArchive(archive, final.hash, certificateHash);
  return {
    archive,
    archiveHash: sha256(archive),
    certificate,
    certificateHash,
    finalHash: final.hash,
  };
}

export function verifyFinalArchive(
  archive: Uint8Array,
  expectedFinalHash: string,
  expectedCertificateHash: string,
) {
  const entries = unzipSync(archive);
  if (!entries['final.pdf'] || !entries['audit-certificate.pdf'] ||
      !entries['manifest.json'] || !entries['checksums.sha256'])
    throw new Error('Final archive contains missing files.');
  const listed = strFromU8(entries['checksums.sha256'])
    .trimEnd()
    .split('\n')
    .map((line) => line.match(/^([a-f0-9]{64})  ([\w./-]+)$/));
  if (listed.some((match) => !match) || listed.length !== Object.keys(entries).length - 1)
    throw new Error('Final archive checksum list is invalid.');
  if (
    new Set(listed.map((match) => match![2])).size !== listed.length ||
    listed.some((match) => match![2] === 'checksums.sha256' ||
      !Object.hasOwn(entries, match![2]))
  )
    throw new Error('Final archive checksum list has unexpected entries.');
  for (const match of listed) {
    const [, hash, name] = match!;
    if (!entries[name] || sha256(entries[name]) !== hash)
      throw new Error(`Final archive checksum failed for ${name}.`);
  }
  if (
    sha256(entries['final.pdf']) !== expectedFinalHash ||
    sha256(entries['audit-certificate.pdf']) !== expectedCertificateHash
  )
    throw new Error('Final archive PDF checksum does not match its record.');
  const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as {
    finalPdfSha256: string;
    certificateSha256: string;
    documentVersions: Array<{ archivePath: string; sha256: string }>;
  };
  if (
    manifest.finalPdfSha256 !== expectedFinalHash ||
    manifest.certificateSha256 !== expectedCertificateHash
  )
    throw new Error('Final archive manifest does not match its record.');
  if (manifest.documentVersions.length !== Object.keys(entries).length - 3)
    throw new Error('Final archive version manifest is incomplete.');
  if (new Set(manifest.documentVersions.map((version) => version.archivePath)).size !==
      manifest.documentVersions.length)
    throw new Error('Final archive version paths are duplicated.');
  for (const version of manifest.documentVersions)
    if (!entries[version.archivePath] ||
        sha256(entries[version.archivePath]) !== version.sha256)
      throw new Error('Final archive version hash does not match its manifest.');
}

async function buildCertificate(input: FinalArchiveInput) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([612, 792]);
  let y = 740;
  const line = (value: string, heading = false) => {
    const safe = pdfSafe(value);
    const face = heading ? bold : font;
    const size = heading ? 14 : 9;
    let remaining = safe;
    while (remaining) {
      if (y < 62) {
        page = document.addPage([612, 792]);
        y = 740;
      }
      let end = remaining.length;
      while (end > 1 && face.widthOfTextAtSize(remaining.slice(0, end), size) > 516)
        end--;
      page.drawText(remaining.slice(0, end), {
        x: 48, y, size, font: face, color: rgb(0.16, 0.13, 0.17),
      });
      y -= heading ? 28 : 17;
      remaining = remaining.slice(end);
    }
  };
  line('Engage Sign - electronic signature certificate', true);
  line(`Envelope: ${input.envelopeId}`);
  line(`Completed (UTC): ${input.completedAt}`);
  line('Document versions and SHA-256 hashes', true);
  for (const version of input.versions) {
    line(`${version.kind} | ${version.id}`);
    line(version.hash);
  }
  line('Signer events', true);
  for (const event of input.events) {
    line(`${event.name} | ${event.role} | ${event.method}`);
    line(`Signed (UTC): ${event.signedAt} | Consent: ${event.consentVersion}`);
    line('Presented PDF SHA-256:');
    line(event.presentedHash);
  }
  line('The final PDF and this certificate have separate checksums in the archive manifest.');
  return document.save();
}

function pdfSafe(value: string) {
  return Array.from(value, (character) =>
    character.charCodeAt(0) >= 32 && character.charCodeAt(0) <= 126
      ? character
      : '?',
  ).join('');
}
