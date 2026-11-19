import type { Metadata } from 'next';
import './globals.css';
import InstallPrompt from '@/components/install-prompt';

export const metadata: Metadata = {
  title: 'BURGER HOUSE | برجر هاوس',
  description: 'BURGER HOUSE — برجر محضّر بعناية. اطلب واستلم من الفرع.',
  applicationName: 'BURGER HOUSE',
  appleWebApp: { capable: true, title: 'BURGER HOUSE', statusBarStyle: 'black-translucent' },
  manifest: '/manifest.webmanifest',
  icons: { icon: '/brand-mark.svg', apple: '/brand-mark.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Playfair+Display:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Tajawal:wght@400;500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#f4f1eb] text-[#201e1a] antialiased selection:bg-[#a65e36] selection:text-white">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}
