export async function register() {
  const { resolveMailTransport } = await import('./lib/mail-transport');
  resolveMailTransport();
}
