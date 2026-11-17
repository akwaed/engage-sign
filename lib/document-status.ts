export const DASHBOARD_STATUSES = [
  'Draft',
  'Sent',
  'Viewed',
  'Completed',
  'Declined',
  'Expired',
  'Canceled',
  'Failed',
] as const;

export type DashboardStatus = (typeof DASHBOARD_STATUSES)[number];

export function dashboardStatus(input: {
  status: string;
  deliveryFailed: boolean;
}): DashboardStatus {
  if (input.status === 'voided') return 'Canceled';
  if (input.status === 'declined') return 'Declined';
  if (input.status === 'expired') return 'Expired';
  if (input.status === 'completed') return 'Completed';
  if (input.status === 'draft') return 'Draft';
  if (
    input.deliveryFailed &&
    (input.status === 'sent' || input.status === 'viewed')
  )
    return 'Failed';
  if (input.status === 'viewed' || input.status === 'partially_signed')
    return 'Viewed';
  return 'Sent';
}

export function isDashboardStatus(value: string): value is DashboardStatus {
  return (DASHBOARD_STATUSES as readonly string[]).includes(value);
}

export function completedDownloadAllowed(input: {
  isAdmin: boolean;
  sameOwner: boolean;
  status: string;
}) {
  return (input.isAdmin || input.sameOwner) && input.status === 'completed';
}

export const DASHBOARD_STATUS_SQL = `CASE
  WHEN e.status = 'voided' THEN 'Canceled'
  WHEN e.status = 'declined' THEN 'Declined'
  WHEN e.status = 'expired' THEN 'Expired'
  WHEN e.status = 'completed' THEN 'Completed'
  WHEN e.status = 'draft' THEN 'Draft'
  WHEN e.status IN ('sent', 'viewed')
    AND NOT EXISTS (
      SELECT 1 FROM signers signed
      WHERE signed.envelope_id = e.id AND signed.status = 'signed'
    )
    AND EXISTS (
      SELECT 1 FROM notification_outbox failed_mail
      JOIN signers failed_signer ON failed_signer.id = failed_mail.signer_id
      WHERE failed_signer.envelope_id = e.id
        AND failed_mail.status = 'failed'
        AND failed_mail.attempts >= 3
        AND failed_mail.notification_type IN ('invite', 'next_signer')
    )
  THEN 'Failed'
  WHEN e.status IN ('viewed', 'partially_signed') THEN 'Viewed'
  ELSE 'Sent'
END`;
