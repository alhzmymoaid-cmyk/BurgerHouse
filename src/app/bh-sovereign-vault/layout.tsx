import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'BH Admin | BURGER HOUSE',
  applicationName: 'BH Admin',
  manifest: '/manifest-admin.webmanifest',
  appleWebApp: { capable: true, title: 'BH Admin', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icons/admin-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/admin-512.png', sizes: '512x512', type: 'image/png' }], apple: '/icons/admin-180.png' },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) { return children; }
