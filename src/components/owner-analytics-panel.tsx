'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, ShoppingBag, Users, CheckCircle2, XCircle } from 'lucide-react';

type AnalyticsData = {
  scope:{role:string;branch_id:string|null};
  metrics:{customers:number;total_orders:number;completed_orders:number;rejected_orders:number;average_order_value:number;today_sales:number;month_sales:number};
  daily_sales:{date:string;orders:number;revenue:number}[];
  top_products:{name:string;quantity:number;revenue:number}[];
  branch_comparison:{branch_id:string;branch_name:string;orders:number;revenue:number}[];
};
const money=(n:number)=>new Intl.NumberFormat('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);

export default function OwnerAnalyticsPanel(){
  const [data,setData]=useState<AnalyticsData|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const response=await fetch('/api/admin/analytics',{cache:'no-store'});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error==='BRANCH_ASSIGNMENT_REQUIRED'?'يجب تعيين مدير الفرع إلى فرع أولاً.':result.error||'تعذر تحميل الإحصائيات.');
      setData(result);
    }catch(e:any){setError(e.message||'تعذر تحميل الإحصائيات.');}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const exportCsv=()=>{
    if(!data)return;
    const rows=[['التاريخ','عدد الطلبات المكتملة','المبيعات (ر.س)'],...data.daily_sales.map(row=>[row.date,String(row.orders),String(row.revenue.toFixed(2))])];
    const csv='\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='burger-house-sales.csv';anchor.click();URL.revokeObjectURL(url);
  };

  const cards=data?[ 
    {label:'العملاء',value:data.metrics.customers.toLocaleString('ar-SA'),icon:Users},
    {label:'إجمالي الطلبات',value:data.metrics.total_orders.toLocaleString('ar-SA'),icon:ShoppingBag},
    {label:'الطلبات المستلمة',value:data.metrics.completed_orders.toLocaleString('ar-SA'),icon:CheckCircle2},
    {label:'المرفوضة والملغاة',value:data.metrics.rejected_orders.toLocaleString('ar-SA'),icon:XCircle},
  ]:[];
  return <section dir="rtl" className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><span className="text-[10px] font-semibold tracking-[.16em] text-[#F2B705]">BUSINESS OVERVIEW</span><h2 className="mt-1 text-xl font-bold">الإحصائيات والمبيعات</h2><p className="mt-1 text-xs text-[#9E9BA3]">أرقام مباشرة من الطلبات المسجلة في قاعدة البيانات</p></div><div className="flex gap-2"><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold"><RefreshCw size={14}/> تحديث</button><button onClick={exportCsv} disabled={!data} className="inline-flex items-center gap-2 rounded-lg bg-[#F2B705] px-3 py-2 text-xs font-bold text-[#0A0A0C] disabled:opacity-40"><Download size={14}/> تصدير CSV</button></div></div>
    {error&&<p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/20 p-3 text-xs text-red-300">{error}</p>}
    {loading&&!data?<div className="h-44 animate-pulse rounded-2xl bg-[#141417]"/>:data&&<>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(card=><div key={card.label} className="rounded-xl border border-white/10 bg-[#141417] p-4"><div className="flex items-center justify-between text-[#9E9BA3]"><span className="text-[11px]">{card.label}</span><card.icon size={17}/></div><div className="mt-3 text-2xl font-bold tabular-nums">{card.value}</div></div>)}</div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#141417] p-4"><span className="text-[11px] text-[#9E9BA3]">مبيعات اليوم</span><div className="mt-2 text-xl font-bold tabular-nums text-[#F2B705]">{money(data.metrics.today_sales)} ر.س</div></div>
        <div className="rounded-xl border border-white/10 bg-[#141417] p-4"><span className="text-[11px] text-[#9E9BA3]">مبيعات الشهر</span><div className="mt-2 text-xl font-bold tabular-nums text-[#F2B705]">{money(data.metrics.month_sales)} ر.س</div></div>
        <div className="rounded-xl border border-white/10 bg-[#141417] p-4"><span className="text-[11px] text-[#9E9BA3]">متوسط قيمة الطلب (AOV)</span><div className="mt-2 text-xl font-bold tabular-nums">{money(data.metrics.average_order_value)} ر.س</div></div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141417]">
          <div className="border-b border-white/10 px-4 py-3"><h3 className="text-sm font-bold">المبيعات اليومية — هذا الشهر</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-start text-xs"><thead className="text-[#9E9BA3]"><tr><th className="px-4 py-3 font-medium">التاريخ</th><th className="px-4 py-3 font-medium">الطلبات</th><th className="px-4 py-3 font-medium">المبيعات</th></tr></thead><tbody>{data.daily_sales.map(row=><tr key={row.date} className="border-t border-white/5"><td className="px-4 py-3 tabular-nums">{row.date}</td><td className="px-4 py-3 tabular-nums">{row.orders}</td><td className="px-4 py-3 font-bold tabular-nums text-[#F2B705]">{money(row.revenue)} ر.س</td></tr>)}{!data.daily_sales.length&&<tr><td colSpan={3} className="px-4 py-8 text-center text-[#9E9BA3]">لا توجد مبيعات مكتملة خلال هذا الشهر.</td></tr>}</tbody></table></div>
        </div>
        <div className="overflow-hidden rounded-xl border border-white/10 bg-[#141417]">
          <div className="border-b border-white/10 px-4 py-3"><h3 className="text-sm font-bold">الأكثر مبيعًا — هذا الشهر</h3></div>
          <div className="divide-y divide-white/5">{data.top_products.map((item,index)=><div key={item.name} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex items-center gap-3"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#1B1B1F] text-[11px] text-[#F2B705]">{index+1}</span><div><b className="text-xs">{item.name}</b><p className="mt-1 text-[10px] text-[#9E9BA3]">{item.quantity} قطعة</p></div></div><span className="text-xs font-bold tabular-nums">{money(item.revenue)} ر.س</span></div>)}{!data.top_products.length&&<p className="px-4 py-8 text-center text-xs text-[#9E9BA3]">لا توجد بيانات كافية بعد.</p>}</div>
        </div>
      </div>
      {data.scope.role!=='branch_manager'&&<div className="overflow-hidden rounded-xl border border-white/10 bg-[#141417]"><div className="border-b border-white/10 px-4 py-3"><h3 className="text-sm font-bold">مقارنة الفروع — هذا الشهر</h3></div><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">{data.branch_comparison.map(branch=><div key={branch.branch_id} className="rounded-lg border border-white/10 bg-[#1B1B1F] p-3"><b className="text-xs">{branch.branch_name}</b><div className="mt-2 text-lg font-bold tabular-nums text-[#F2B705]">{money(branch.revenue)} ر.س</div><p className="mt-1 text-[10px] text-[#9E9BA3]">{branch.orders} طلب مكتمل</p></div>)}</div></div>}
    </>}
  </section>;
}
