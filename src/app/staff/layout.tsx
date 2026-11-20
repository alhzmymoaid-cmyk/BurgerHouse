import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BH Staff | BURGER HOUSE',
  applicationName: 'BH Staff',
  manifest: '/manifest-staff.webmanifest',
  appleWebApp: { capable: true, title: 'BH Staff', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icons/staff-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/staff-512.png', sizes: '512x512', type: 'image/png' }], apple: '/icons/staff-192.png' },
};

export default function StaffLayout({ children }: { children: React.ReactNode }) { return children; }
