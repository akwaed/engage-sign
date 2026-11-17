export function trustedProxyHops(value = process.env.TRUSTED_PROXY) {
  if (value === undefined || value.trim() === '') return 0;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0)
    throw new Error('TRUSTED_PROXY must be a non-negative integer.');
  return hops;
}

export function selectClientIp(input: {
  forwardedFor?: string | null;
  realIp?: string | null;
  socketAddress?: string | null;
  trustedHops?: number;
}) {
  const socket = normalizeIp(input.socketAddress);
  const real = normalizeIp(input.realIp);
  const forwarded = (input.forwardedFor ?? '')
    .split(',')
    .map((part) => normalizeIp(part))
    .filter((ip): ip is string => Boolean(ip));
  const hops = input.trustedHops ?? 0;
  if (hops > 0) {
    const chain = socket ? [...forwarded, socket] : forwarded;
    if (chain.length) return chain[Math.max(0, chain.length - 1 - hops)];
  }
  return real ?? socket;
}

function normalizeIp(value: string | null | undefined) {
  const ip = value?.trim();
  if (!ip) return null;
  return ip.replace(/^::ffff:/, '');
}
