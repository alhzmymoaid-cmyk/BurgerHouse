'use client';

import PromoManager from '@/components/promo-manager';
import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Power, Wrench, Users, Ban, ClipboardList, RefreshCw } from 'lucide-react';

const roles=[
  {value:'owner',label:'مالك'},
  {value:'branch_manager',label:'مدير فرع'},
  {value:'cashier',label:'كاشير'},
  {value:'kitchen_staff',label:'موظف مطبخ'},
  {value:'super_admin',label:'مدير أعلى'}
];
const field='w-full rounded-lg border border-white/10 bg-[#1B1B1F] px-3 py-2.5 text-xs text-[#F6F3EC] outline-none focus:border-[#F2B705]';

export default function SovereignSuperAdminVaultPage(){
  const [vaultData,setVaultData]=useState<any|null>(null);
  const [accessDenied,setAccessDenied]=useState<string|null>(null);
  const [entityType,setEntityType]=useState<'phone'|'ip'|'session'>('phone');
  const [entityValue,setEntityValue]=useState('');
  const [blockReason,setBlockReason]=useState('');
  const [maintenanceMessage,setMaintenanceMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  const loadSovereignData=useCallback(async()=>{
    try{
      const response=await fetch('/api/admin/sovereign',{cache:'no-store'});
      const result=await response.json();
      if(!response.ok){setAccessDenied(result.message||result.error||'لا تملك صلاحية الوصول إلى هذه الصفحة.');return;}
      setAccessDenied(null);setVaultData(result);setMaintenanceMessage(result.settings?.maintenance_message_ar||'');
    }catch(e:any){setAccessDenied(e?.message||'تعذر تحميل بيانات الإدارة.');}
  },[]);
  useEffect(()=>{void loadSovereignData();},[loadSovereignData]);

  const executeSovereignAction=async(payload:any)=>{
    setBusy(true);setNotice('');
    try{
      const response=await fetch('/api/admin/sovereign',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||result.error||'تعذر تنفيذ الإجراء.');
      setNotice('تم حفظ التغيير.');
      await loadSovereignData();
      return true;
    }catch(e:any){setNotice(e.message||'تعذر تنفيذ الإجراء.');return false;}
    finally{setBusy(false);}
  };

  if(accessDenied)return <main dir="rtl" className="bh-superadmin flex min-h-screen items-center justify-center p-6"><section className="max-w-md rounded-2xl border border-red-500/25 bg-[#141417] p-8 text-center"><ShieldCheck size={30} className="mx-auto text-red-300"/><h1 className="mt-4 text-xl font-bold">لا يمكن فتح هذه الصفحة</h1><p className="mt-3 text-sm text-[#9E9BA3]">{accessDenied}</p><a href="/auth/login" className="mt-5 inline-block rounded-lg bg-[#F2B705] px-5 py-3 text-xs font-bold text-[#0A0A0C]">تسجيل دخول الإدارة</a></section></main>;

  const activeBlocks=(vaultData?.blocked_entities||[]).filter((item:any)=>item.is_active);
  const settings=vaultData?.settings||{};

  return <main dir="rtl" className="bh-superadmin min-h-screen space-y-6 p-4 sm:p-6">
    <header className="border-b border-white/10 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><img src="/brand-mark.svg" alt="" className="h-12 w-12"/><div><span className="text-[10px] font-semibold tracking-[.16em] text-[#F2B705]">BURGER HOUSE</span><h1 className="mt-1 text-2xl font-bold">مركز الإدارة العامة</h1><p className="mt-1 text-xs text-[#9E9BA3]">تشغيل الموقع، الموظفون، الفروع، وسجل الحماية</p></div></div>
        <button onClick={()=>void loadSovereignData()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold"><RefreshCw size={14}/> تحديث البيانات</button>
      </div>
    </header>
    <PromoManager />
    {notice&&<p role="status" className="rounded-lg border border-white/10 bg-[#141417] p-3 text-xs text-[#F2B705]">{notice}</p>}

    {vaultData&&<>
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#141417] p-5">
          <div className="flex items-center gap-2"><Power size={18} className="text-[#F2B705]"/><h2 className="text-sm font-bold">حالة الموقع</h2></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#1B1B1F] p-4"><div><b className="text-sm">{settings.site_online?'الموقع متاح للزوار':'الموقع متوقف'}</b><p className="mt-1 text-[11px] text-[#9E9BA3]">يمكنك إيقاف استقبال الزيارات أو إعادة فتحه.</p></div><button disabled={busy} onClick={()=>void executeSovereignAction({action:'SET_SYSTEM_AVAILABILITY',site_online:!settings.site_online,maintenance_mode:settings.maintenance_mode,maintenance_message_ar:maintenanceMessage})} className="rounded-lg bg-[#F2B705] px-4 py-3 text-xs font-bold text-[#0A0A0C] disabled:opacity-50">{settings.site_online?'إيقاف الموقع':'تشغيل الموقع'}</button></div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#1B1B1F] p-4"><div><b className="text-sm">وضع الصيانة</b><p className="mt-1 text-[11px] text-[#9E9BA3]">{settings.maintenance_mode?'رسالة الصيانة ظاهرة للزوار.':'وضع الصيانة غير مفعّل.'}</p></div><button disabled={busy} onClick={()=>void executeSovereignAction({action:'SET_SYSTEM_AVAILABILITY',site_online:settings.site_online,maintenance_mode:!settings.maintenance_mode,maintenance_message_ar:maintenanceMessage})} className="rounded-lg border border-[#F2B705]/40 px-4 py-3 text-xs font-bold text-[#F2B705] disabled:opacity-50">{settings.maintenance_mode?'إنهاء الصيانة':'تفعيل الصيانة'}</button></div>
          <label className="mt-4 block text-xs font-bold text-[#9E9BA3]">رسالة الصيانة التي تظهر للزوار<textarea rows={3} value={maintenanceMessage} onChange={e=>setMaintenanceMessage(e.target.value)} className={field+' mt-2'}/></label>
          <button disabled={busy} onClick={()=>void executeSovereignAction({action:'SET_SYSTEM_AVAILABILITY',site_online:settings.site_online,maintenance_mode:settings.maintenance_mode,maintenance_message_ar:maintenanceMessage})} className="mt-3 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-bold disabled:opacity-50">حفظ رسالة الصيانة</button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#141417] p-5">
          <div className="flex items-center gap-2"><Ban size={18} className="text-[#F2B705]"/><h2 className="text-sm font-bold">إضافة حظر</h2></div>
          <form onSubmit={async(e)=>{e.preventDefault();const ok=await executeSovereignAction({action:'BLOCK_ENTITY',entity_type:entityType,entity_value:entityValue,reason:blockReason});if(ok){setEntityValue('');setBlockReason('');}}} className="mt-4 space-y-3">
            <select value={entityType} onChange={e=>setEntityType(e.target.value as any)} className={field}><option value="phone">رقم جوال</option><option value="ip">عنوان IP</option><option value="session">معرف جلسة</option></select>
            <input required value={entityValue} onChange={e=>setEntityValue(e.target.value)} placeholder="القيمة المطلوب حظرها" className={field}/>
            <input required value={blockReason} onChange={e=>setBlockReason(e.target.value)} placeholder="سبب الحظر" className={field}/>
            <button disabled={busy} className="rounded-lg bg-red-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">إضافة إلى قائمة الحظر</button>
          </form>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#141417] p-5">
        <div className="flex items-center gap-2"><Users size={18} className="text-[#F2B705]"/><h2 className="text-sm font-bold">الموظفون ومديرو الفروع</h2></div>
        <div className="mt-4 space-y-2">{(vaultData.user_profiles||[]).map((staff:any)=><article key={staff.id} className="grid gap-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-3 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-center">
          <div><b className="text-xs">{staff.full_name}</b><p className="mt-1 text-[10px] text-[#9E9BA3]" dir="ltr">{staff.email}</p></div>
          <select value={staff.role} onChange={e=>void executeSovereignAction({action:'MANAGE_USER_PROFILE_STATUS',target_user_id:staff.id,new_role:e.target.value})} className={field}>{roles.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select>
          <select value={staff.assigned_branch_id||''} onChange={e=>void executeSovereignAction({action:'MANAGE_USER_PROFILE_STATUS',target_user_id:staff.id,assigned_branch_id:e.target.value||null})} className={field}><option value="">بدون فرع محدد</option>{(vaultData.branches||[]).map((branch:any)=><option key={branch.id} value={branch.id}>{branch.name_ar}</option>)}</select>
          <button disabled={busy||staff.id===vaultData.super_admin?.id} onClick={()=>void executeSovereignAction({action:'MANAGE_USER_PROFILE_STATUS',target_user_id:staff.id,is_active:!staff.is_active})} className={staff.is_active?'rounded-lg border border-red-500/30 px-3 py-2 text-[10px] text-red-300':'rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] text-emerald-300'}>{staff.is_active?'إيقاف الحساب':'تفعيل الحساب'}</button>
        </article>)}</div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#141417] p-5">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Ban size={18} className="text-[#F2B705]"/><h2 className="text-sm font-bold">قائمة المحظورين</h2></div><span className="text-[10px] text-[#9E9BA3]">{activeBlocks.length} حظر نشط</span></div>
        <div className="mt-4 space-y-2">{activeBlocks.map((item:any)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#1B1B1F] p-3"><div><b className="text-xs" dir="ltr">{item.entity_value}</b><p className="mt-1 text-[10px] text-[#9E9BA3]">{item.entity_type} · {item.reason}</p></div><button disabled={busy} onClick={()=>void executeSovereignAction({action:'UNBLOCK_ENTITY',entity_type:item.entity_type,entity_value:item.entity_value})} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] text-emerald-300">فك الحظر</button></div>)}{!activeBlocks.length&&<p className="py-6 text-center text-xs text-[#9E9BA3]">لا توجد حالات حظر نشطة.</p>}</div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#141417] p-5"><div className="flex items-center gap-2"><ClipboardList size={18} className="text-[#F2B705]"/><h2 className="text-sm font-bold">سجل العمليات الإدارية</h2></div><div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">{(vaultData.audit_logs||[]).slice(0,50).map((log:any)=><div key={log.id} className="rounded-lg border border-white/5 bg-[#1B1B1F] p-3"><div className="flex justify-between gap-2"><b className="text-[11px]">{log.action}</b><span className="text-[9px] text-[#9E9BA3]">{new Date(log.created_at).toLocaleString('ar-SA')}</span></div><p className="mt-1 text-[10px] text-[#9E9BA3]">{log.actor_name} · {log.actor_role} · {log.target_type} · {log.target_id}</p></div>)}</div></div>
        <div className="rounded-2xl border border-white/10 bg-[#141417] p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-[#F2B705]"/><h2 className="text-sm font-bold">سجل الحماية والتنبيهات</h2></div><div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto">{(vaultData.security_abuse_logs||[]).slice(0,50).map((log:any)=><div key={log.id} className="rounded-lg border border-white/5 bg-[#1B1B1F] p-3"><div className="flex justify-between gap-2"><b className="text-[11px]">{log.event_type}</b><span className={log.severity==='critical'||log.severity==='high'?'text-[9px] text-red-300':'text-[9px] text-amber-300'}>{log.severity}</span></div><p className="mt-1 text-[10px] text-[#9E9BA3]">{new Date(log.created_at).toLocaleString('ar-SA')}</p></div>)}</div></div>
      </section>
    </>}
  </main>;
}
