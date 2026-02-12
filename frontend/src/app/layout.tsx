import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Font configurations
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'CTX Quiz',
    template: '%s | CTX Quiz',
  },
  description: 'Real-time synchronized quiz platform for live events',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/icons/icon-192x192.svg',
  },
  keywords: ['quiz', 'live quiz', 'real-time', 'events', 'conference', 'game show'],
  authors: [{ name: 'CTX', url: 'https://ctx.works' }],
  creator: 'CTX',
  publisher: 'CTX Quiz',
  metadataBase: new URL('https://ctx.works'),
  manifest: '/manifest.json',
  // Note: mobile-web-app-capable is handled by the manifest.json display: standalone
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://ctx.works',
    siteName: 'CTX Quiz',
    title: 'CTX Quiz - Live Quiz Platform',
    description: 'Real-time synchronized quiz platform for live events',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CTX Quiz - Live Quiz Platform',
    description: 'Real-time synchronized quiz platform for live events',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#E8ECEF' },
    { media: '(prefers-color-scheme: dark)', color: '#1A1D21' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[var(--neu-bg)] font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
