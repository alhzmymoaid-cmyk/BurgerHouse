import type { Metadata, Viewport } from 'next';
import './globals.css';
import './burger-house-refresh.css';
import './enterprise-theme.css';
import './burger-house-dark-overrides.css';
import './burger-house-premium.css';
import SmartPwaInstallBanner from '@/components/install-prompt';

export const viewport: Viewport = { themeColor: '#FAF7F1', colorScheme: 'light', viewportFit: 'cover' };

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
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Cairo:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#0A0A0C] text-[#F6F3EC] antialiased selection:bg-[#F2B705] selection:text-[#0A0A0C]">
        {children}
        <SmartPwaInstallBanner />
      </body>
    </html>
  );
}
