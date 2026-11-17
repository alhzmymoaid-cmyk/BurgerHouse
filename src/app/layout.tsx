import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BURGER HOUSE | برجر هاوس — Luxury Artisan Wagyu Burgers',
  description: 'نظام الطلبات الفاخر والاستلام من الفروع لمطعم برجر هاوس — تجربة واغيو استثنائية',
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
      <body className="min-h-screen bg-[#0B0A09] text-[#F5EFE6] antialiased selection:bg-[#D49A3A] selection:text-[#0B0A09]">
        {children}
      </body>
    </html>
  );
}
