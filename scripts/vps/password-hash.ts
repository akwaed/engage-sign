import { hashPassword } from '../../lib/auth/password';
if (!process.stdin.isTTY || !process.stdin.setRawMode) {
  console.error('Run this command in an interactive terminal.');
  process.exit(1);
}
process.stdout.write('New administrator password (hidden, 14+ characters): ');
process.stdin.setRawMode(true);
process.stdin.resume();
let password = '';
for await (const chunk of process.stdin) {
  for (const byte of chunk as Buffer) {
    if (byte === 3) { process.stdout.write('\nCancelled.\n'); process.exit(130); }
    if (byte === 13 || byte === 10) { process.stdout.write('\n'); process.stdin.setRawMode(false); process.stdin.pause(); break; }
    if (byte === 127 || byte === 8) password = password.slice(0, -1);
    else if (byte >= 32 && byte <= 126 && password.length < 200) password += String.fromCharCode(byte);
  }
  if (!process.stdin.isRaw) break;
}
try {
  if (password.length < 14) throw new Error('Use at least 14 characters.');
  console.log(await hashPassword(password));
} finally { password = ''; }