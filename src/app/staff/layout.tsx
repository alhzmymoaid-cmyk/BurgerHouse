import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = { themeColor: '#09090B', colorScheme: 'dark', viewportFit: 'cover' };

export const metadata: Metadata = {
  title: 'BH Staff | BURGER HOUSE',
  applicationName: 'BH Staff',
  manifest: '/manifest-staff.webmanifest',
  appleWebApp: { capable: true, title: 'BH Staff', statusBarStyle: 'black' },
  icons: { icon: [{ url: '/icons/staff-192.png?v=3', sizes: '192x192', type: 'image/png' }, { url: '/icons/staff-512.png?v=3', sizes: '512x512', type: 'image/png' }], apple: '/icons/staff-180.png?v=3' },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) { return children; }
