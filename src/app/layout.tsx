import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BURGER HOUSE | برجر هاوس',
  description: 'برجر طازج يُحضّر عند الطلب. تصفح القائمة واختر فرع الاستلام.',
  applicationName: 'BURGER HOUSE',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Tajawal:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <meta name="theme-color" content="#f4f5f2" />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
