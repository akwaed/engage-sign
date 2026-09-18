import 'server-only';

import mysql, { type Pool } from 'mysql2/promise';

declare global {
  // Reuse the pool across Next.js hot reloads in development.
  var engageSignMysqlPool: Pool | undefined;
}

export function getMysqlPool(): Pool {
  if (global.engageSignMysqlPool) return global.engageSignMysqlPool;

  const databaseUrl = process.env.DATABASE_URL;
  const host = process.env.DB_HOST ?? process.env.MYSQL_HOST;
  const database = process.env.DB_NAME ?? process.env.MYSQL_DATABASE;
  const user = process.env.DB_USER ?? process.env.MYSQL_USER;
  const password = process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD;

  if (!databaseUrl && (!host || !database || !user || !password)) {
    throw new Error(
      'MySQL is not configured. GoDaddy should inject DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD.',
    );
  }

  const shared = {
    connectionLimit: 8,
    enableKeepAlive: true,
    timezone: 'Z',
    dateStrings: true as const,
    charset: 'utf8mb4',
    decimalNumbers: true,
  };

  global.engageSignMysqlPool = databaseUrl
    ? mysql.createPool({ uri: databaseUrl, ...shared })
    : mysql.createPool({
        host,
        port: Number(process.env.DB_PORT ?? process.env.MYSQL_PORT ?? 3306),
        database,
        user,
        password,
        ...shared,
      });

  return global.engageSignMysqlPool;
}
