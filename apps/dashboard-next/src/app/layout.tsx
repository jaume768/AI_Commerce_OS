import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Commerce OS — Control Center',
  description: 'AI-powered Shopify store management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
