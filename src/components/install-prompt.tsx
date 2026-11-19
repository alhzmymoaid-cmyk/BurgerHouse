'use client';

import { useEffect, useState } from 'react';
import { X, Smartphone, Share, Plus, MoreHorizontal, Download, CheckCircle2 } from 'lucide-react';

declare global { interface Window { deferredPwaPrompt?: any } }

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [safari, setSafari] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    setIos(isIos);
    setSafari(isSafari);
    setInstalled(standalone);
    if (standalone || localStorage.getItem('bh-install-dismissed') === '1') return;

    const onPrompt = (event: Event) => {
      event.preventDefault();
      window.deferredPwaPrompt = event;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const timer = window.setTimeout(() => setShow(true), 8500);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  const close = () => {
    setShow(false);
    localStorage.setItem('bh-install-dismissed', '1');
  };

  const install = async () => {
    if (window.deferredPwaPrompt) {
      window.deferredPwaPrompt.prompt();
      await window.deferredPwaPrompt.userChoice;
      window.deferredPwaPrompt = null;
      setShow(false);
    }
  };

  if (!show || installed) return null;

  return (
    <div className="bh-install-backdrop" dir="rtl">
      <section className="bh-install-card" role="dialog" aria-modal="true" aria-labelledby="bh-install-title">
        <button className="bh-install-close" onClick={close} aria-label="إغلاق"><X size={18}/></button>
        <div className="bh-install-brand"><img src="/brand-mark.svg" alt=""/><div><span>BURGER HOUSE</span><small>YOUR BURGER HOUSE, ONE TAP AWAY</small></div></div>
        <div className="bh-install-heading"><span className="bh-install-icon"><Smartphone size={23}/></span><div><p className="bh-eyebrow">APP EXPERIENCE</p><h2 id="bh-install-title">خلّ برجر هاوس أقرب لك</h2><p>أضف الموقع إلى الشاشة الرئيسية وافتحه مثل التطبيق.</p></div></div>
        {ios ? <div className="bh-install-steps">
          <div className="bh-install-step"><span>١</span><div><b>افتح الموقع في Safari</b><p>{safari ? 'أنت تستخدم Safari بالفعل.' : 'إذا كنت تستخدم متصفحاً آخر، افتح الرابط في Safari أولاً.'}</p></div><Share size={20}/></div>
          <div className="bh-install-step"><span>٢</span><div><b>اضغط زر مشاركة</b><p>ستجده أسفل الشاشة في Safari، وقد يظهر أعلى الشاشة في بعض إصدارات iPad.</p></div><Share size={20}/></div>
          <div className="bh-install-step"><span>٣</span><div><b>اختر «إضافة إلى الشاشة الرئيسية»</b><p>مرّر خيارات المشاركة لأسفل إذا لم يظهر الخيار مباشرة.</p></div><Plus size={20}/></div>
          <div className="bh-install-tip"><CheckCircle2 size={16}/> تأكد من تفعيل خيار «فتح كتطبيق ويب» إذا ظهر لك.</div>
        </div> : <div className="bh-install-steps">
          <p className="bh-install-android-copy">ثبّت BURGER HOUSE على جهازك للوصول السريع إلى المنيو وطلباتك.</p>
          <button className="bh-install-action" onClick={install}><Download size={17}/> تثبيت التطبيق</button>
          <div className="bh-install-tip"><CheckCircle2 size={16}/> يظهر التطبيق على الشاشة الرئيسية بعد الموافقة.</div>
        </div>}
        <button className="bh-install-later" onClick={close}>ليس الآن</button>
      </section>
    </div>
  );
}
