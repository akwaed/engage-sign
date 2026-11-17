import { verifyMailConnection } from '../../lib/signing-mail';
import { safeErrorCode } from '../../lib/mail-security';
try {
  await verifyMailConnection();
  console.log('SMTP authentication and TLS verification passed.');
} catch (error) {
  const detail = error && typeof error === 'object' ? error as {
    responseCode?: number; command?: string;
  } : {};
  console.error('SMTP verification failed:', safeErrorCode(error),
    'status', Number.isInteger(detail.responseCode) ? detail.responseCode : 'none',
    'stage', /^(CONN|EHLO|STARTTLS|AUTH(?: .*)?)$/.test(detail.command ?? '') ?
      detail.command : 'unknown');
  process.exitCode = 1;
}
