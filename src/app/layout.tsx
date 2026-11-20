import type { Metadata, Viewport } from 'next';
import './globals.css';
import './burger-house-refresh.css';
import SmartPwaInstallBanner from '@/components/install-prompt';

export const viewport: Viewport = { themeColor: '#F7F5F0', colorScheme: 'light', viewportFit: 'cover' };

export const metadata: Metadata = {
  title: 'BURGER HOUSE | برجر هاوس',
  description: 'BURGER HOUSE — برجر محضّر بعناية. اطلب واستلم من الفرع.',
  applicationName: 'BURGER HOUSE',
  appleWebApp: { capable: true, title: 'BURGER HOUSE', statusBarStyle: 'default' },
  manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icons/customer-192.png?v=3', sizes: '192x192', type: 'image/png' }, { url: '/icons/customer-512.png?v=3', sizes: '512x512', type: 'image/png' }], apple: '/icons/apple-touch-icon.png?v=3' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png?v=3" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Playfair+Display:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[#F7F5F0] text-[#292522] antialiased selection:bg-[#F0C9C9] selection:text-[#351717]">
        {children}
        <SmartPwaInstallBanner />
      </body>
    </html>
  );
}
