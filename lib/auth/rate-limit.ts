import 'server-only';

import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { toMysqlDate } from '@/lib/audit';
import {
  rateAllowed,
  rateSubjectHash,
  rateWindowStart,
} from '@/lib/auth/rate-limit-policy';
import { getMysqlPool } from '@/lib/mysql';

export async function consumeRateLimit(input: {
  bucket: string;
  value: string;
  limit: number;
  windowSeconds: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const start = rateWindowStart(now, input.windowSeconds);
  const subject = rateSubjectHash(input.bucket, input.value);
  await getMysqlPool().execute<ResultSetHeader>(
    `INSERT INTO auth_rate_limits (bucket, subject_hash, window_start, attempts)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE attempts = attempts + 1`,
    [input.bucket, subject, toMysqlDate(start)],
  );
  const [rows] = await getMysqlPool().query<
    Array<RowDataPacket & { attempts: number }>
  >(
    `SELECT attempts FROM auth_rate_limits
      WHERE bucket = ? AND subject_hash = ? AND window_start = ?`,
    [input.bucket, subject, toMysqlDate(start)],
  );
  return rateAllowed(Number(rows[0]?.attempts ?? input.limit + 1), input.limit);
}
