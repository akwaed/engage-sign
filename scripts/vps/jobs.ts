import { dispatchAccountNotifications } from '../../lib/auth/account-mail';
import { expireDueEnvelopes } from '../../lib/envelope-expiration';
import { getMysqlPool } from '../../lib/mysql';
import {
  queueDueReminders,
  dispatchNotifications,
} from '../../lib/signing-mail';
const pool = getMysqlPool();
try {
  const expired = await expireDueEnvelopes();
  const reminders = await queueDueReminders();
  const enabled = process.env.MAIL_ENABLED === 'true';
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
} catch {
  console.error(
    'Scheduled job failed; inspect database and service configuration.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
