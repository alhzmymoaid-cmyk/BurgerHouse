type StorefrontMaintenanceProps = {
  siteOnline: boolean;
  message: string;
};

export default function StorefrontMaintenance({ siteOnline, message }: StorefrontMaintenanceProps) {
  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-bh-bg px-5 py-12 text-bh-text">
      <section className="w-full max-w-lg rounded-2xl border border-bh-line bg-bh-surface p-8 text-center shadow-bh-card">
        <img src="/brand-mark.svg" alt="BURGER HOUSE" className="mx-auto h-16 w-16" />
        <p className="mt-6 text-[10px] font-bold tracking-[.2em] text-bh-accent">BURGER HOUSE</p>
        <h1 className="mt-3 text-2xl font-bold">{siteOnline ? 'نجهّز لكم تجربة أفضل' : 'نعود إليكم قريبًا'}</h1>
        <p className="mt-3 text-sm leading-7 text-bh-muted">{message}</p>
        <a href="https://wa.me/966535717670" className="mt-6 inline-flex rounded-xl bg-bh-accent px-6 py-3 text-xs font-bold text-[#17140e] transition hover:-translate-y-0.5 hover:bg-bh-accent-strong">
          تواصل معنا
        </a>
      </section>
    </main>
  );
}
