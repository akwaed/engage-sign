import { getMysqlPool } from '../../lib/mysql';
import { expireDueEnvelopes } from '../../lib/envelope-expiration';
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
  console.log(
    JSON.stringify({
      expired,
      reminders,
      mailEnabled: enabled,
      sent: results.filter((r) => r.sent).length,
      failed: results.filter((r) => !r.sent).length,
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
