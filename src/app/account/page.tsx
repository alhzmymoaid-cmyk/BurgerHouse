'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound, UtensilsCrossed, Phone } from 'lucide-react';

export default function CustomerAccountPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (window.location.hash === '#signup') setMode('signup');
  }, []);

  const normalizeSaudiPhone = (value: string) => {
    const digits = value.replace(/\\D/g, '');
    if (/^05\\d{8}$/.test(digits)) return '+966' + digits.slice(1);
    if (/^5\\d{8}$/.test(digits)) return '+966' + digits;
    if (/^9665\\d{8}$/.test(digits)) return '+' + digits;
    return '';
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const supabase = createSupabaseBrowserClient();
      const normalizedPhone = normalizeSaudiPhone(phone);
      if (!normalizedPhone) throw new Error('أدخل رقم جوال سعودي صحيحًا يبدأ بـ 05 ويتكون من 10 أرقام.');

      if (mode === 'signup') {
        if (!name.trim()) throw new Error('اكتب اسمك الكامل.');
        const { data, error: signupError } = await supabase.auth.signUp({
          phone: normalizedPhone,
          password,
          options: { data: { full_name: name.trim(), phone: normalizedPhone } }
        });
        if (signupError) throw signupError;
        if (!data.session) {
          throw new Error('إعدادات المصادقة ما زالت تطلب رمز SMS. يجب تعطيل تأكيد الهاتف من Supabase Auth حتى يعمل التسجيل بالجوال وكلمة المرور دون رمز.');
        }
        router.push('/account/orders');
        router.refresh();
        return;
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password
      });
      if (loginError) throw loginError;
      router.push('/account/orders');
      router.refresh();
    } catch (caught: any) {
      setError(caught?.message || 'تعذر إكمال العملية. تحقق من رقم الجوال وكلمة المرور.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="bh-account min-h-screen" dir="rtl">
      <div className="bh-account-topline"><span>BURGER HOUSE</span><span>GOOD FOOD. GOOD MOOD.</span></div>
      <div className="bh-account-layout">
        <section className="bh-account-visual">
          <a href="/" className="bh-account-back"><ArrowRight size={16}/> العودة إلى المتجر</a>
          <div className="bh-account-visual-copy">
            <img src="/brand-mark.svg" alt="BURGER HOUSE" className="bh-account-logo"/>
            <p className="bh-eyebrow">YOUR HOUSE. YOUR ORDERS.</p>
            <h1>كل طلب تحبه،<br/><em>في مكان واحد.</em></h1>
            <p className="bh-account-lead">أنشئ حسابك لتتابع طلباتك، تحتفظ بفواتيرك، وتعيد طلب وجبتك المفضلة بسهولة.</p>
            <div className="bh-account-perks">
              <div><CheckCircle2/><span>سجل طلبات وفواتير محفوظ</span></div>
              <div><CheckCircle2/><span>إعادة طلب أسرع في المرات القادمة</span></div>
              <div><CheckCircle2/><span>تحديث حالة الطلب لحظة بلحظة</span></div>
            </div>
          </div>
          <div className="bh-account-photo"><img src="/images/hero-wagyu-smash.jpg" alt="برجر واغيو سماش"/><span>MADE FRESH FOR YOU</span></div>
        </section>

        <section className="bh-account-panel">
          <div className="bh-account-form-head">
            <div className="bh-account-icon"><UtensilsCrossed size={22}/></div>
            <p className="bh-eyebrow">MEMBER ACCESS</p>
            <h2>{mode === 'login' ? 'أهلاً بعودتك' : 'ابدأ حسابك الآن'}</h2>
            <p>{mode === 'login' ? 'سجّل الدخول برقم جوالك وكلمة المرور لمتابعة طلباتك.' : 'أنشئ حسابك برقم الجوال وكلمة المرور دون انتظار رمز البريد.'}</p>
          </div>

          <div className="bh-account-switch" role="tablist" aria-label="نوع الحساب">
            <button type="button" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setNotice(''); }}>تسجيل الدخول</button>
            <button type="button" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setNotice(''); }}>حساب جديد</button>
          </div>

          <form onSubmit={submit} className="bh-account-form">
            {mode === 'signup' && <label>الاسم الكامل<div className="bh-field"><UserRound/><input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="اكتب اسمك"/></div></label>}
            <label>رقم الجوال السعودي<div className="bh-field"><Phone/><input required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={e => setPhone(e.target.value.replace(/[^0-9+]/g, '').slice(0, 16))} placeholder="05XXXXXXXX"/></div></label>
            <small className="text-xs text-zinc-400">رقمك هو معرّف تسجيل الدخول، ويُستخدم لتحديثات الطلب.</small>
            <label>كلمة المرور<div className="bh-field"><LockKeyhole/><input required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="٨ أحرف على الأقل"/><button type="button" className="bh-password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label>
            {error && <div className="bh-account-alert" role="alert">{error}</div>}
            {notice && <div className="bh-account-notice" role="status">{notice}</div>}
            <button type="submit" disabled={busy} className="bh-account-submit">{busy ? 'جارٍ التحقق...' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'} <span>←</span></button>
          </form>
          <div className="bh-account-security"><ShieldCheck size={16}/><span>تسجيل الدخول برقم الجوال وكلمة المرور. لا نطلب رمز تحقق عبر البريد.</span></div>
        </section>
      </div>
    </main>
  );
}
