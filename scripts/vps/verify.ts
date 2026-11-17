import type { RowDataPacket } from 'mysql2/promise';
import { getMysqlPool } from '../../lib/mysql';
import { readPrivateObject } from '../../lib/private-storage';
import { sha256 } from '../../lib/template-files';
import { encryptValue, decryptValue } from '../../lib/encryption';
import { convertDocxToPdf } from '../../lib/docx-convert';
const pool = getMysqlPool();
try {
  const [rows] = await pool.query<Array<RowDataPacket & {source_storage_key:string;source_hash:string}>>('SELECT source_storage_key,source_hash FROM template_versions');
  for (const row of rows) {
    if (sha256(await readPrivateObject(row.source_storage_key))!==row.source_hash) throw new Error('Template integrity failed');
  }
  const docx = rows.find(row=>row.source_storage_key.endsWith('.docx'))!;
  const converted = await Promise.all([convertDocxToPdf(await readPrivateObject(docx.source_storage_key)),convertDocxToPdf(await readPrivateObject(docx.source_storage_key))]);
  if (converted.some(bytes=>bytes.length<100)) throw new Error('Conversion failed');
  if (decryptValue(encryptValue('vps-smoke-test','vps:test'),'vps:test')!=='vps-smoke-test') throw new Error('Encryption failed');
  console.log(`Verified ${rows.length} stored template hashes, concurrent conversion requests, and encryption round trip as the service user.`);
} finally { await pool.end(); }
