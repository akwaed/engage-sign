import { isAbsolute } from 'node:path';

export const PRODUCTION_APP_ORIGIN = 'https://sign.engagess.co';

export type MailTransport =
  | { mode: 'smtp' }
  | { mode: 'file'; directory: string };

type MailEnv = Record<string, string | undefined>;

export function resolveMailTransport(
  env: MailEnv = process.env,
): MailTransport {
  const selected = (env.MAIL_TRANSPORT ?? '').trim().toLowerCase();
  if (selected === '' || selected === 'smtp') return { mode: 'smtp' };
  if (selected !== 'file')
    throw new Error('MAIL_TRANSPORT must be smtp or file.');
  assertFileMailAllowed(env);
  const directory = (env.MAIL_FILE_DIR ?? '').trim();
  if (!directory || !isAbsolute(directory))
    throw new Error('MAIL_FILE_DIR must be an absolute directory.');
  return { mode: 'file', directory };
}

export function assertFileMailAllowed(env: MailEnv = process.env) {
  let origin = '';
  try {
    origin = new URL(env.APP_URL ?? '').origin;
  } catch {
    origin = '';
  }
  if (origin === PRODUCTION_APP_ORIGIN)
    throw new Error(
      'File mail cannot be used when APP_URL is https://sign.engagess.co.',
    );
  if (env.NODE_ENV === 'production' && env.ENGAGE_ALLOW_FILE_MAIL !== 'true')
    throw new Error(
      'File mail is disabled when NODE_ENV=production unless ENGAGE_ALLOW_FILE_MAIL=true.',
    );
}

export function fileMailAppOrigin(appUrl = process.env.APP_URL) {
  if (!appUrl) throw new Error('APP_URL is required before sending documents.');
  const url = new URL(appUrl);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost')
    throw new Error('APP_URL must use HTTPS for signing invitations.');
  if (url.origin === PRODUCTION_APP_ORIGIN)
    throw new Error(
      'File mail cannot be used when APP_URL is https://sign.engagess.co.',
    );
  return url.origin;
}
