'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseCustomerBrowserClient } from '@/lib/supabase/client';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound, UtensilsCrossed, Phone } from 'lucide-react';

export default function CustomerAccountPage({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' | 'forgot' }) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>(initialMode);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [forgotName, setForgotName] = useState('');
  const [forgotPhone, setForgotPhone] = useState('');
  const supportWhatsApp = '966535717670';

  useEffect(() => {
    let active = true;
    createSupabaseCustomerBrowserClient().auth.getUser().then(({ data: { user } }) => {
      if (active && user && (user.app_metadata?.customer_account === true || Boolean(user.phone))) {
        router.replace('/account/orders');
      }
    }).catch(() => undefined);
    if (window.location.hash === '#signup') setMode('signup');
    if (window.location.hash === '#forgot') setMode('forgot');
    return () => { active = false; };
  }, [router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'forgot') return;
    if (mode === 'signup' && password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ mode, phone, password, fullName: name }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message_ar || 'تعذر إكمال العملية. تحقق من البيانات وحاول مرة أخرى.');
      }
      router.replace('/account/orders');
      router.refresh();
      setConfirmPassword('');
    } catch (caught: any) {
      setError(caught?.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="bh-account min-h-screen" dir="rtl">
      <div className="bh-account-topline">
        <a href="/" className="bh-account-brand"><img src="/brand-mark.svg" alt="" /> BURGER HOUSE</a>
        <span>حسابك وطلباتك في مكان واحد</span>
      </div>

      <div className="bh-account-layout">
        <section className="bh-account-visual">
          <a href="/" className="bh-account-back"><ArrowRight size={17}/> العودة إلى المتجر</a>
          <div className="bh-account-visual-copy">
            <img src="/brand-mark.svg" alt="BURGER HOUSE" className="bh-account-logo"/>
            <p className="bh-eyebrow">YOUR HOUSE. YOUR ORDERS.</p>
            <h1>كل طلب تحبه،<br/><em>في مكان واحد.</em></h1>
            <p className="bh-account-lead">أنشئ حسابك لمتابعة طلباتك وفواتيرك، وإعادة طلب وجبتك المفضلة بسهولة.</p>
            <div className="bh-account-perks">
              <div><CheckCircle2/><span>سجل طلبات وفواتير محفوظ</span></div>
              <div><CheckCircle2/><span>إعادة طلب أسرع في المرات القادمة</span></div>
              <div><CheckCircle2/><span>متابعة حالة الطلب أولًا بأول</span></div>
            </div>
          </div>
          <div className="bh-account-photo"><img src="/images/hero-wagyu-smash.jpg" alt="برجر واغيو سماش"/><span>MADE FRESH FOR YOU</span></div>
        </section>

        <section className="bh-account-panel">
          <div className="bh-account-form-head">
            <div className="bh-account-icon"><UtensilsCrossed size={23}/></div>
            <div>
              <p className="bh-eyebrow">MEMBER ACCESS</p>
              <h1>{mode === 'login' ? 'أهلاً بعودتك' : mode === 'signup' ? 'أنشئ حسابك' : 'استعادة كلمة المرور'}</h1>
            </div>
            <p>{mode === 'login' ? 'أدخل رقم جوالك وكلمة المرور للدخول إلى حسابك ومتابعة طلباتك.' : mode === 'signup' ? 'أدخل بياناتك مرة واحدة، وبعدها تقدر تتابع طلباتك من حسابك.' : 'أدخل الاسم ورقم الجوال المسجلين في حسابك، وسنفتح محادثة الدعم لمساعدتك.'}</p>
          </div>

          {mode !== 'forgot' ? (
            <div className="bh-account-switch" role="tablist" aria-label="نوع الحساب">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>تسجيل الدخول</button>
              <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>إنشاء حساب جديد</button>
            </div>
          ) : (
            <button type="button" onClick={() => { setMode('login'); setError(''); }} className="mb-4 text-xs font-bold text-[#a65e36] underline">العودة إلى تسجيل الدخول</button>
          )}

          <form onSubmit={submit} className="bh-account-form">
            {(mode === 'signup' || mode === 'forgot') && (
              <label className="bh-account-label">
                <span>{mode === 'forgot' ? 'الاسم المسجل في الحساب' : 'الاسم الكامل'}</span>
                <div className="bh-field">
                  <UserRound aria-hidden="true"/>
                  <input required autoComplete="name" value={mode === 'forgot' ? forgotName : name} onChange={e => mode === 'forgot' ? setForgotName(e.target.value) : setName(e.target.value)} placeholder="اكتب اسمك" maxLength={100}/>
                </div>
              </label>
            )}

            <label className="bh-account-label">
              <span>{mode === 'forgot' ? 'رقم الجوال المسجل' : 'رقم الجوال'}</span>
              <div className="bh-field">
                <Phone aria-hidden="true"/>
                <input required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={mode === 'forgot' ? forgotPhone : phone} onChange={e => mode === 'forgot' ? setForgotPhone(e.target.value.replace(/[^0-9+٠-٩۰-۹]/g, '').slice(0, 18)) : setPhone(e.target.value.replace(/[^0-9+٠-٩۰-۹]/g, '').slice(0, 18))} placeholder="05XXXXXXXX" maxLength={18}/>
              </div>
              <small>رقم سعودي يبدأ بـ 05 — مثال: 0501234567</small>
            </label>

            {mode !== 'forgot' && <label className="bh-account-label">
              <span>كلمة المرور</span>
              <div className="bh-field">
                <LockKeyhole aria-hidden="true"/>
                <input required minLength={8} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="8 أحرف على الأقل"/>
                <button type="button" className="bh-password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff/> : <Eye/>}</button>
              </div>
              {mode === 'signup' && <small>استخدم كلمة مرور يصعب تخمينها ولا تشاركها مع أحد.</small>}
            {mode === 'signup' && <label className="bh-account-label">
              <span>تأكيد كلمة المرور</span>
              <div className="bh-field">
                <LockKeyhole aria-hidden="true"/>
                <input required minLength={8} maxLength={72} autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="أعد كتابة كلمة المرور"/>
              </div>
            </label>}
              {mode === 'login' && <button type="button" onClick={() => { setMode('forgot'); setError(''); setForgotName(name); setForgotPhone(phone); }} className="mt-2 text-xs font-bold text-[#a65e36] underline">نسيت كلمة المرور؟</button>}
              {mode === 'login' && <a href="/register" className="mt-2 block text-xs font-semibold text-[#9E9BA3] underline">طلبت سابقًا كضيف؟ أنشئ حسابًا لمتابعة طلباتك</a>}
            </label>}

            {error && <div className="bh-account-alert" role="alert">{error}</div>}
            {mode === 'forgot' ? (
              <button type="button" disabled={!forgotName.trim() || !forgotPhone.trim() || !supportWhatsApp} onClick={() => {
                const localized = forgotPhone.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
                const digits = localized.replace(/\D/g, '').replace(/^0/, '966');
                if (!/^9665\d{8}$/.test(digits)) { setError('أدخل رقم جوال سعودي صحيحًا.'); return; }
                const message = 'السلام عليكم، أنا ' + forgotName.trim() + '، ورقم الجوال المسجل في حسابي هو ' + forgotPhone.trim() + '. نسيت كلمة المرور وأريد استعادتها لحسابي في BURGER HOUSE. أرجو مساعدتي بعد التحقق من ملكية الرقم.';
                window.open('https://wa.me/' + supportWhatsApp + '?text=' + encodeURIComponent(message), '_blank', 'noopener,noreferrer');
              }} className="bh-account-submit">إرسال إلى الدعم عبر واتساب <span aria-hidden="true">←</span></button>
            ) : (
              <button type="submit" disabled={busy} className="bh-account-submit">
                {busy ? 'جارٍ تنفيذ الطلب...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء الحساب'}
                <span aria-hidden="true">←</span>
              </button>
            )}
          </form>

          {mode !== 'forgot' && <div className="bh-account-security">
            <ShieldCheck size={18}/>
            <span>الدخول برقم الجوال وكلمة المرور فقط، بدون رمز SMS أو بريد إلكتروني.</span>
          </div>}
          <p className="bh-account-switch-note">بالمتابعة، أنت مسؤول عن استخدام رقم جوالك الصحيح والحفاظ على سرية كلمة المرور.</p>
        </section>
      </div>
    </main>
  );
}
