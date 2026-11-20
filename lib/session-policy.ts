export const ABSOLUTE_SESSION_HOURS = 12;

export function idleMinutes(value = process.env.SESSION_IDLE_MINUTES) {
  if (value === undefined || value.trim() === '') return 30;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720)
    throw new Error('SESSION_IDLE_MINUTES must be an integer from 5 to 720.');
  return minutes;
}

export function sessionIdleExpired(input: {
  lastSeenAt: Date;
  now: Date;
  idleMinutes: number;
}) {
  return (
    input.now.getTime() - input.lastSeenAt.getTime() >
    input.idleMinutes * 60_000
  );
}
