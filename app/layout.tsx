import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Engage Sign',
    template: '%s · Engage Sign',
  },
  description:
    'Secure document signing, signer routing, audit records, and legal archive exports for Engage Support Services.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
