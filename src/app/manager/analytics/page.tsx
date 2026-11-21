import OwnerAnalyticsPanel from '@/components/owner-analytics-panel';

export default function BranchManagerAnalyticsPage() {
  return <main dir="rtl" className="bh-owner-shell min-h-screen space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
      <div><span className="text-[10px] font-semibold tracking-[.16em] text-[#F2B705]">BRANCH REPORT</span><h1 className="mt-1 text-2xl font-bold">إحصائيات الفرع</h1><p className="mt-1 text-xs text-[#9E9BA3]">عرض مبيعات وطلبات الفرع المعيّن لحسابك فقط.</p></div>
      <a href="/staff/orders" className="rounded-lg border border-white/10 px-4 py-2 text-xs font-bold text-[#F2B705]">العودة للطلبات</a>
    </header>
    <OwnerAnalyticsPanel />
  </main>;
}
