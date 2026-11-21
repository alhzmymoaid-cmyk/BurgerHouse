'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Apple, Check, Copy, Download, Plus, Share, Smartphone, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};
declare global {
  interface Navigator { standalone?: boolean; }
}

const DISMISS_KEY = 'bh-pwa-dismissed-at-v2';
const APP_CONFIG = {
  customer: { path: '/', title: 'BURGER HOUSE', description: 'ثبّت متجر برجر هاوس للوصول إليه بسرعة', icon: '/icons/customer-192.png?v=4' },
  admin: { path: '/bh-sovereign-vault', title: 'BH Admin', description: 'ثبّت تطبيق الإدارة العامة لبرجر هاوس', icon: '/icons/admin-192.png?v=4' },
  catalog: { path: '/catalog-studio', title: 'BH Catalog', description: 'ثبّت تطبيق إدارة المنتجات والمنيو', icon: '/icons/admin-192.png?v=4' },
  owner: { path: '/owner-studio', title: 'BH Owner', description: 'ثبّت تطبيق إدارة المالك لبرجر هاوس', icon: '/icons/admin-192.png?v=4' },
  staff: { path: '/staff/orders', title: 'BH Staff', description: 'ثبّت تطبيق تشغيل الموظفين والطلبات', icon: '/icons/staff-192.png?v=4' },
} as const;
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;

export default function SmartPwaInstallBanner() {
  const pathname = usePathname();
  const appType = pathname === '/' ? 'customer' : pathname === '/bh-sovereign-vault' ? 'admin' : pathname === '/catalog-studio' ? 'catalog' : pathname === '/owner-studio' ? 'owner' : pathname === '/staff/orders' ? 'staff' : null;
  const appConfig = appType ? APP_CONFIG[appType] : null;
  const dismissKey = appType ? `${DISMISS_KEY}-${appType}` : DISMISS_KEY;
  const promptRef = useRef<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [device, setDevice] = useState<'ios-safari' | 'ios-other' | 'android' | 'other'>('other');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isStandalone = useCallback(() => (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true
  ), []);

  useEffect(() => {
    setVisible(false);
    setSheetOpen(false);
    setInstalled(false);
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|CriOS|DuckDuckGo|YaBrowser|Instagram|FBAN|FBAV|WhatsApp|ChatGPT|OpenAI|Telegram|Snapchat|TikTok|Twitter|MicroMessenger|GSA/i.test(ua);
    const nextDevice = ios ? (safari ? 'ios-safari' : 'ios-other') : (/Android/i.test(ua) ? 'android' : 'other');
    setDevice(nextDevice);

    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    if (!appType) return;
    const dismissedAt = Number(localStorage.getItem(dismissKey) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL) {
      // Explicitly opening the install flow from the menu is still allowed.
    } else if (dismissedAt) {
      localStorage.removeItem(dismissKey);
    }

    const showIfAllowed = () => {
      if (!appType || isStandalone()) return;
      const dismissed = Number(localStorage.getItem(dismissKey) || 0);
      if (dismissed && Date.now() - dismissed < DISMISS_TTL) return;
      setVisible(true);
    };

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as InstallPromptEvent;
      showIfAllowed();
    };
    const onInstalled = () => {
      promptRef.current = null;
      setInstalled(true);
      setVisible(false);
      setSheetOpen(false);
    };
    const onManualOpen = () => {
      if (!appType || isStandalone()) return;
      setVisible(true);
      setSheetOpen(false);
    };
    const onFirstInteraction = () => showIfAllowed();

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('bh:open-install', onManualOpen);
    window.addEventListener('pointerdown', onFirstInteraction, { once: true, passive: true });
    const timer = window.setTimeout(showIfAllowed, 4000);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('bh:open-install', onManualOpen);
      window.removeEventListener('pointerdown', onFirstInteraction);
    };
  }, [isStandalone, pathname, appType, dismissKey]);

  const dismiss = () => {
    localStorage.setItem(dismissKey, String(Date.now()));
    setVisible(false);
    setSheetOpen(false);
  };

  const install = async () => {
    const prompt = promptRef.current;
    if (!prompt) {
      setSheetOpen(true);
      return;
    }
    promptRef.current = null;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') setVisible(false);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(new URL(appConfig?.path || '/', window.location.origin).href);
      setCopied(true);
      setSheetOpen(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      const input = document.createElement('textarea');
      input.value = new URL(appConfig?.path || '/', window.location.origin).href;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const success = document.execCommand('copy');
      input.remove();
      setCopied(success);
      setSheetOpen(true);
      window.setTimeout(() => setCopied(false), 2200);
    }
  };

  if (!appConfig || !visible || installed) return null;

  const isIosSafari = device === 'ios-safari';
  const isIosOther = device === 'ios-other';

  return (
    <>
      <aside className="bh-pwa-banner" dir="rtl" role="region" aria-label="تثبيت تطبيق برجر هاوس">
        <div className="bh-pwa-app-icon"><img src={appConfig.icon} alt="" /></div>
        <div className="bh-pwa-banner-copy">
          <strong>ثبّت {appConfig.title}</strong>
          <span>{isIosOther ? 'افتح الرابط في Safari ثم أضفه إلى الشاشة الرئيسية' : appConfig.description}</span>
        </div>
        {isIosOther ? (
          <button type="button" className="bh-pwa-primary bh-pwa-copy" onClick={copyLink}>
            {copied ? <Check size={16}/> : <Copy size={16}/>} إضافة إلى الشاشة الرئيسية
          </button>
        ) : isIosSafari ? (
          <button type="button" className="bh-pwa-primary" onClick={() => setSheetOpen(true)}>إضافة إلى الشاشة الرئيسية</button>
        ) : (
          <button type="button" className="bh-pwa-primary" onClick={install}>
            <Download size={16}/> إضافة إلى الشاشة الرئيسية
          </button>
        )}
        <button type="button" className="bh-pwa-close" onClick={dismiss} aria-label="إغلاق إشعار التثبيت"><X size={17}/></button>
      </aside>

      {sheetOpen && (
        <div className="bh-pwa-sheet-backdrop" dir="rtl" onClick={() => setSheetOpen(false)}>
          <section className="bh-pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="bh-pwa-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="bh-pwa-sheet-handle"/>
            <button type="button" className="bh-pwa-sheet-close" onClick={() => setSheetOpen(false)} aria-label="إغلاق"><X size={18}/></button>
            <div className="bh-pwa-sheet-app">
              <img src={appConfig.icon} alt="" />
              <div><small>{appConfig.title}</small><h2 id="bh-pwa-sheet-title">إضافة {appConfig.title} إلى الشاشة الرئيسية</h2></div>
            </div>
            {isIosSafari ? (
              <ol className="bh-pwa-steps">
                <li><span>1</span><div><b>اضغط مشاركة</b><p>أيقونة المربع والسهم للأعلى في شريط Safari.</p></div><Share size={21}/></li>
                <li><span>2</span><div><b>اختر «إضافة إلى الشاشة الرئيسية»</b><p>قد تحتاج إلى التمرير لأسفل في قائمة المشاركة.</p></div><Plus size={21}/></li>
                <li><span>3</span><div><b>اضغط «إضافة»</b><p>سيظهر BURGER HOUSE على الشاشة الرئيسية.</p></div><Check size={21}/></li>
              </ol>
            ) : isIosOther ? (
              <ol className="bh-pwa-steps">
                <li><span>1</span><div><b>افتح Safari</b><p>افتح Safari والصق الرابط الذي نسخته في شريط العنوان.</p></div><Apple size={21}/></li>
                <li><span>2</span><div><b>اضغط مشاركة</b><p>اختر أيقونة المربع والسهم للأعلى أسفل الشاشة.</p></div><Share size={21}/></li>
                <li><span>3</span><div><b>إضافة إلى الشاشة الرئيسية</b><p>اختر «إضافة» وسيظهر التطبيق على شاشتك.</p></div><Check size={21}/></li>
              </ol>
            ) : (
              <div className="bh-pwa-steps">
                <div className="bh-pwa-tip"><Smartphone size={20}/><p>في Chrome اضغط ⋮ أعلى الشاشة، ثم اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» واتبع التأكيد.</p></div>
              </div>
            )}
            <button type="button" className="bh-pwa-sheet-done" onClick={() => setSheetOpen(false)}>حسنًا</button>
          </section>
        </div>
      )}
    </>
  );
}
