import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Framecode - AI Video from Code',
  description: 'An AI chat application that makes videos by writing code. Minimal, fast, and code-native.',
  openGraph: {
    title: 'Framecode - AI Video from Code',
    description: 'An AI chat application that makes videos by writing code.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Framecode - AI Video from Code',
    description: 'An AI chat application that makes videos by writing code.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1F1E1D',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="bg-[#1F1E1D] text-[#FAF9F5] antialiased">
        {children}
      </body>
    </html>
  );
}
