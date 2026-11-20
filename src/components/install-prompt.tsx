'use client';

import { useEffect, useState } from 'react';
import { X, Smartphone, Share, Plus, MoreHorizontal, Download, CheckCircle2, ExternalLink } from 'lucide-react';

declare global { interface Window { deferredPwaPrompt?: any } }

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [safari, setSafari] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [nativePromptReady, setNativePromptReady] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios|tiktok|instagram|fbav|fban/i.test(ua);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    setIos(isIos);
    setSafari(isSafari);
    setInstalled(standalone);
    if (standalone || localStorage.getItem('bh-install-dismissed-v3') === '1') return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.deferredPwaPrompt = event;
      setNativePromptReady(true);
      setShow(true);
    };
    const onInstalled = () => {
      window.deferredPwaPrompt = undefined;
      setInstalled(true);
      setShow(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const timer = window.setTimeout(() => setShow(true), 1200);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const close = () => {
    setShow(false);
    localStorage.setItem('bh-install-dismissed-v3', '1');
  };

  const install = async () => {
    const promptEvent = window.deferredPwaPrompt;
    if (!promptEvent) {
      setNativePromptReady(false);
      return;
    }
    window.deferredPwaPrompt = undefined;
    setNativePromptReady(false);
    promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === 'accepted') setShow(false);
  };

  if (!show || installed) return null;

  return (
    <div className="bh-install-backdrop" dir="rtl">
      <section className="bh-install-card" role="dialog" aria-modal="true" aria-labelledby="bh-install-title">
        <button className="bh-install-close" onClick={close} aria-label="إغلاق"><X size={18}/></button>
        <div className="bh-install-brand"><img src="/brand-mark.svg" alt=""/><div><span>BURGER HOUSE</span><small>YOUR BURGER HOUSE, ONE TAP AWAY</small></div></div>
        <div className="bh-install-heading"><span className="bh-install-icon"><Smartphone size={23}/></span><div><p className="bh-eyebrow">APP EXPERIENCE</p><h2 id="bh-install-title">خلّ برجر هاوس أقرب لك</h2><p>أضف الموقع إلى الشاشة الرئيسية وافتحه كتطبيق مستقل.</p></div></div>
        {ios ? <div className="bh-install-steps">
          {!safari && <div className="bh-install-tip"><ExternalLink size={16}/> افتح صفحة المتجر في Safari أولاً؛ المتصفح الحالي لا يدعم التثبيت المباشر.</div>}
          <div className="bh-install-step"><span>١</span><div><b>افتح الموقع في Safari</b><p>{safari ? 'أنت تستخدم Safari بالفعل.' : 'من قائمة المشاركة في المتصفح اختر فتح في Safari أو انسخ الرابط وافتحه هناك.'}</p></div><ExternalLink size={20}/></div>
          <div className="bh-install-step"><span>٢</span><div><b>اضغط زر مشاركة</b><p>المربع مع السهم للأعلى في شريط Safari.</p></div><Share size={20}/></div>
          <div className="bh-install-step"><span>٣</span><div><b>اختر «إضافة إلى الشاشة الرئيسية»</b><p>من خيارات المشاركة، ثم اضغط «إضافة» أعلى الشاشة.</p></div><Plus size={20}/></div>
          <div className="bh-install-tip"><CheckCircle2 size={16}/> على iPhone لا يظهر مربع تثبيت تلقائي؛ هذه هي طريقة Apple الرسمية.</div>
        </div> : <div className="bh-install-steps">
          {nativePromptReady ? <>
            <p className="bh-install-android-copy">يمكن تثبيت BURGER HOUSE مباشرة على جهازك.</p>
            <button className="bh-install-action" onClick={install}><Download size={17}/> تثبيت التطبيق الآن</button>
          </> : <>
            <p className="bh-install-android-copy">إذا لم يظهر زر التثبيت المباشر، افتح قائمة المتصفح ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>
            <div className="bh-install-step"><span>١</span><div><b>افتح قائمة المتصفح ⋮</b><p>في Chrome أعلى الشاشة.</p></div><MoreHorizontal size={20}/></div>
            <div className="bh-install-step"><span>٢</span><div><b>اختر «تثبيت التطبيق»</b><p>أو «إضافة إلى الشاشة الرئيسية» ثم أكّد التثبيت.</p></div><Download size={20}/></div>
          </>}
          <div className="bh-install-tip"><CheckCircle2 size={16}/> سيظهر التطبيق على الشاشة الرئيسية بعد موافقتك.</div>
        </div>}
        <button className="bh-install-later" onClick={close}>ليس الآن</button>
      </section>
    </div>
  );
}
