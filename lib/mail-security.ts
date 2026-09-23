export function sanitizeProviderResponse(value: string | undefined) {
  return (value ?? 'accepted')
    .replace(/https?:\/\/\S+/gi, '[redacted-url]')
    .replace(/[A-Za-z0-9_-]{43,}/g, '[redacted]')
    .slice(0, 255);
}

export function safeErrorCode(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String(error.code) : '';
  return /^(EAUTH|ECONNECTION|ETIMEDOUT|ESOCKET|EENVELOPE|EMESSAGE|ETLS)$/.test(code)
    ? code : 'UNKNOWN';
}
