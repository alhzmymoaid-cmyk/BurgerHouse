import type { Metadata, Viewport } from 'next';
import './globals.css';
import './burger-house-refresh.css';
import SmartPwaInstallBanner from '@/components/install-prompt';

export const viewport: Viewport = { themeColor: '#09090B', colorScheme: 'dark', viewportFit: 'cover' };

export const metadata: Metadata = {
  title: 'BURGER HOUSE | برجر هاوس',
  description: 'BURGER HOUSE — برجر محضّر بعناية. اطلب واستلم من الفرع.',
  applicationName: 'BURGER HOUSE',
  appleWebApp: { capable: true, title: 'BURGER HOUSE', statusBarStyle: 'black-translucent' },
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/svg+xml' }, { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/svg+xml' }], apple: '/icons/icon-192.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="apple-touch-icon" sizes="192x192" href="/icons/icon-192.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Playfair+Display:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#09090B] text-[#FAFAFA] antialiased selection:bg-[#F5B800] selection:text-black">
        {children}
        <SmartPwaInstallBanner />
      </body>
    </html>
  );
}
