import { dispatchAccountNotifications } from '../../lib/auth/account-mail';
import { expireDueEnvelopes } from '../../lib/envelope-expiration';
import { resolveMailTransport } from '../../lib/mail-transport';
import { getMysqlPool } from '../../lib/mysql';
import {
  queueDueReminders,
  dispatchNotifications,
} from '../../lib/signing-mail';
const pool = getMysqlPool();
try {
  const expired = await expireDueEnvelopes();
  const reminders = await queueDueReminders();
  const transport = resolveMailTransport();
  const enabled =
    transport.mode === 'file' || process.env.MAIL_ENABLED === 'true';
  const results = enabled ? await dispatchNotifications(10) : [];
  const accountMail = enabled ? await dispatchAccountNotifications(10) : [];
  console.log(
    JSON.stringify({
      expired,
      reminders,
      mailEnabled: enabled,
      sent: results.filter((r) => r.sent).length,
      failed: results.filter((r) => !r.sent).length,
      accountSent: accountMail.filter((r) => r.sent).length,
      accountFailed: accountMail.filter((r) => !r.sent).length,
    }),
  );
} catch (error) {
  const detail = error instanceof Error ? error.message : '';
  console.error(
    detail.startsWith('File mail') || detail.startsWith('MAIL_')
      ? detail
      : 'Scheduled job failed; inspect database and service configuration.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
