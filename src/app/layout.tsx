import type { Metadata, Viewport } from 'next';
import './globals.css';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import './burger-house.css';
import SmartPwaInstallBanner from '@/components/install-prompt';

const arabicFont = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400','500','600','700'], variable: '--font-ibm-plex', display: 'swap' });

export const viewport: Viewport = { themeColor: '#0f0f11', colorScheme: 'dark', viewportFit: 'cover' };

export const metadata: Metadata = {
  title: 'BURGER HOUSE | برجر هاوس',
  description: 'BURGER HOUSE — برجر محضّر بعناية. اطلب واستلم من الفرع.',
  applicationName: 'BURGER HOUSE',
  appleWebApp: { capable: true, title: 'BURGER HOUSE', statusBarStyle: 'black' },
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icons/customer-192.png?v=4', sizes: '192x192', type: 'image/png' }, { url: '/icons/customer-512.png?v=4', sizes: '512x512', type: 'image/png' }], apple: '/icons/apple-touch-icon.png?v=4' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=4" />
      </head>
      <body className={`${arabicFont.variable} min-h-screen antialiased`}>
        {children}
        <SmartPwaInstallBanner />
      </body>
    </html>
  );
}
