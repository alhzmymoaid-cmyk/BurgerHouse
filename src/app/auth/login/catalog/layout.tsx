import type { Metadata, Viewport } from 'next';
export const viewport: Viewport = { themeColor: '#0A0A0C', colorScheme: 'dark', viewportFit: 'cover' };
export const metadata: Metadata = { title: 'BH Catalog Login | BURGER HOUSE', applicationName: 'BH Catalog', manifest: '/manifest-catalog.webmanifest', appleWebApp: { capable: true, title: 'BH Catalog', statusBarStyle: 'black' }, icons: { icon: [{ url: '/icons/admin-192.png?v=4', sizes: '192x192', type: 'image/png' }, { url: '/icons/admin-512.png?v=4', sizes: '512x512', type: 'image/png' }], apple: '/icons/admin-180.png?v=4' } };
export default function CatalogLoginLayout({ children }: { children: React.ReactNode }) { return children; }
