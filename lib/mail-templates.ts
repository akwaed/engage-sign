export type MailKind =
  | 'invite'
  | 'next_signer'
  | 'reminder'
  | 'completion'
  | 'expiration'
  | 'decline'
  | 'void';

export type MailContent = {
  subject: string;
  text: string;
  html: string;
};

export function notificationKind(type: string): MailKind {
  if (/^reminder_\d{1,3}$/.test(type)) return 'reminder';
  if (
    [
      'invite',
      'next_signer',
      'completion',
      'expiration',
      'decline',
      'void',
    ].includes(type)
  )
    return type as MailKind;
  throw new Error('Unknown notification type.');
}

export function renderMail(input: {
  kind: MailKind;
  name: string;
  title: string;
  expiresAt: Date;
  signingUrl?: string;
  includeTitle?: boolean;
}): MailContent {
  const { kind, name, title, expiresAt, signingUrl } = input;
  const expiry = expiresAt.toUTCString();
  const named = input.includeTitle ? `"${title}"` : 'a document';
  const subjects: Record<MailKind, string> = {
    invite: 'Engage Sign: document ready for your signature',
    next_signer: 'Engage Sign: it is your turn to sign',
    reminder: 'Engage Sign: signature reminder',
    completion: 'Engage Sign: document completed',
    expiration: 'Engage Sign: document expired',
    decline: 'Engage Sign: document declined',
    void: 'Engage Sign: document voided',
  };
  const descriptions: Record<MailKind, string> = {
    invite: `Please review and sign ${named} by ${expiry}.`,
    next_signer: `The prior signer has completed their step. Please review and sign ${named} by ${expiry}.`,
    reminder: `This is a reminder to sign ${named} by ${expiry}. Use your original private invitation link.`,
    completion: `All required signatures for ${named} are complete. Contact the sender for the verified final archive.`,
    expiration: `The signing period for ${named} has expired. Its signing links no longer work.`,
    decline: `A required signer declined ${named}. The document is closed.`,
    void: `The sender canceled ${named}. Its signing links no longer work.`,
  };
  if ((kind === 'invite' || kind === 'next_signer') && !signingUrl)
    throw new Error('An invitation needs a signing URL.');
  const action = signingUrl
    ? `\n\nOpen your private signing link:\n${signingUrl}\n\nDo not forward this link.`
    : '';
  const text = `Hello ${name},\n\n${descriptions[kind]}${action}\n\nEngage Sign\n`;
  const html = `<!doctype html><html><body style="margin:0;background:#faf5f2;font-family:Arial,sans-serif;color:#2c2028"><div style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border:1px solid #e7d9d1;border-radius:12px"><p style="margin:0;color:#b84b2d;font-weight:bold;letter-spacing:.08em">ENGAGE SIGN</p><h1 style="font-size:24px;line-height:1.25">${escapeHtml(subjects[kind])}</h1><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(descriptions[kind])}</p>${signingUrl ? `<p><a href="${escapeHtml(signingUrl)}" style="display:inline-block;background:#ed6435;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Review document</a></p><p style="font-size:12px;color:#6b5d63">This private link is intended only for you. Do not forward it.</p>` : ''}<p style="font-size:12px;color:#6b5d63">Engage Sign</p></div></body></html>`;
  return { subject: subjects[kind], text, html };
}

export function renderAccountMail(input: {
  kind: 'password_reset' | 'account_invite';
  url: string;
  expiresAt: Date;
}): MailContent {
  const expiry = input.expiresAt.toUTCString();
  const subject =
    input.kind === 'account_invite'
      ? 'Engage Sign: set your password'
      : 'Engage Sign: reset your password';
  const description =
    input.kind === 'account_invite'
      ? `An Engage Sign account is ready. Set your password by ${expiry}.`
      : `A password reset was requested for your Engage Sign account. This link expires at ${expiry}.`;
  const text = `${description}\n\n${input.url}\n\nIf you did not expect this message, you can ignore it.\n\nEngage Sign\n`;
  const html = `<!doctype html><html><body style="margin:0;background:#faf5f2;font-family:Arial,sans-serif;color:#2c2028"><div style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border:1px solid #e7d9d1;border-radius:12px"><p style="margin:0;color:#b84b2d;font-weight:bold;letter-spacing:.08em">ENGAGE SIGN</p><h1 style="font-size:24px;line-height:1.25">${escapeHtml(subject)}</h1><p>${escapeHtml(description)}</p><p><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#ed6435;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none">Set password</a></p><p style="font-size:12px;color:#6b5d63">If you did not expect this message, you can ignore it.</p></div></body></html>`;
  return { subject, text, html };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}
