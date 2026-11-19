'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound, UtensilsCrossed } from 'lucide-react';

export default function CustomerAccountPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [needsOtp, setNeedsOtp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (window.location.hash === '#signup') setMode('signup');
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const supabase = createSupabaseBrowserClient();
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === 'signup' && !needsOtp) {
        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { data: { full_name: name.trim() } }
        });
        if (signupError) throw signupError;
        if (data.session && data.user?.email_confirmed_at) {
          router.push('/account/orders');
          router.refresh();
          return;
        }
        setNeedsOtp(true);
        setNotice('أرسلنا رمز تحقق إلى بريدك الإلكتروني. أدخله لإكمال إنشاء الحساب.');
        return;
      }

      if (needsOtp) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: normalizedEmail,
          token: otp,
          type: 'signup'
        });
        if (verifyError) throw verifyError;
        router.push('/account/orders');
        router.refresh();
        return;
      }

      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password
      });
      if (loginError) throw loginError;
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        setNeedsOtp(true);
        setMode('signup');
        setNotice('يجب تأكيد بريدك الإلكتروني أولاً. أدخل رمز التحقق المرسل إلى بريدك.');
        return;
      }
      router.push('/account/orders');
      router.refresh();
    } catch (caught: any) {
      const authCode = caught?.code || '';
      if (mode === 'login' && (authCode === 'email_not_confirmed' || /email not confirmed/i.test(caught?.message || ''))) {
        setMode('signup');
        setNeedsOtp(true);
        setNotice('بريدك غير مؤكد بعد. أرسلنا لك شاشة إدخال الرمز؛ استخدم إعادة إرسال الرمز إذا لم تصلك الرسالة.');
      } else {
        setError(caught?.message || 'تعذر إكمال العملية. تحقق من البيانات وحاول مجدداً.');
      }
    } finally {
      setBusy(false);
    }
  };

  const resendOtp = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { error: resendError } = await createSupabaseBrowserClient().auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase()
      });
      if (resendError) throw resendError;
      setNotice('تم طلب إرسال رمز تحقق جديد إلى بريدك الإلكتروني.');
    } catch (caught: any) {
      setError(caught?.message || 'تعذر إعادة إرسال الرمز. حاول لاحقاً.');
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
            <h2>{needsOtp ? 'تأكيد البريد الإلكتروني' : mode === 'login' ? 'أهلاً بعودتك' : 'ابدأ حسابك الآن'}</h2>
            <p>{needsOtp ? 'أدخل رمز التحقق المرسل إلى بريدك الإلكتروني.' : mode === 'login' ? 'سجّل الدخول لتكمل طلبك وتتابع طلباتك السابقة.' : 'أنشئ حسابك ببريدك الإلكتروني وكلمة مرور.'}</p>
          </div>

          <div className="bh-account-switch" role="tablist" aria-label="نوع الحساب">
            <button type="button" aria-selected={mode === 'login' && !needsOtp} className={mode === 'login' && !needsOtp ? 'active' : ''} onClick={() => { setMode('login'); setNeedsOtp(false); setError(''); setNotice(''); }}>تسجيل الدخول</button>
            <button type="button" aria-selected={mode === 'signup' || needsOtp} className={mode === 'signup' || needsOtp ? 'active' : ''} onClick={() => { setMode('signup'); setNeedsOtp(false); setError(''); setNotice(''); }}>حساب جديد</button>
          </div>

          <form onSubmit={submit} className="bh-account-form">
            {mode === 'signup' && !needsOtp && <label>الاسم الكامل<div className="bh-field"><UserRound/><input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="اكتب اسمك"/></div></label>}
            <label>البريد الإلكتروني<div className="bh-field"><Mail/><input required type="email" autoComplete="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} disabled={needsOtp} placeholder="name@example.com"/></div></label>
            {!needsOtp && <label>كلمة المرور<div className="bh-field"><LockKeyhole/><input required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="٨ أحرف على الأقل"/><button type="button" className="bh-password-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label>}
            {needsOtp && <label>رمز التحقق<div className="bh-field bh-otp-field"><ShieldCheck/><input required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" dir="ltr" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000"/></div></label>}
            {error && <div className="bh-account-alert" role="alert">{error}</div>}
            {notice && <div className="bh-account-notice" role="status">{notice}</div>}
            <button type="submit" disabled={busy} className="bh-account-submit">{busy ? 'جارٍ التحقق...' : needsOtp ? 'تأكيد الحساب' : mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'} <span>←</span></button>
          </form>
          {needsOtp && <button type="button" disabled={busy} className="bh-account-secondary" onClick={resendOtp}>إعادة إرسال الرمز</button>}
          {needsOtp && <button type="button" className="bh-account-secondary" onClick={() => { setNeedsOtp(false); setOtp(''); setError(''); setNotice(''); }}>تعديل البيانات</button>}
          <div className="bh-account-security"><ShieldCheck size={16}/><span>يتم التحقق من ملكية البريد الإلكتروني قبل تفعيل الحساب. لا نطلب بيانات الدفع الإلكتروني.</span></div>
        </section>
      </div>
    </main>
  );
}
