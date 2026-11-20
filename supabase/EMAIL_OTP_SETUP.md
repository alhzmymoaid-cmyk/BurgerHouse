# إعداد بريد التحقق — BURGER HOUSE

## ما تم تجهيزه في التطبيق

- إنشاء الحساب: الاسم + البريد الإلكتروني + كلمة المرور + رقم جوال سعودي إلزامي.
- تأكيد البريد برمز OTP من 6 أرقام عبر قالب Confirm signup.
- صلاحية الرمز: 10 دقائق.
- الحد الأدنى بين طلبات إعادة الإرسال: 60 ثانية.
- تسجيل الدخول اليومي: البريد الإلكتروني وكلمة المرور.
- رقم الجوال يحفظ في ملف العميل بصيغة `9665XXXXXXXX` ويستخدم لمطابقة بيانات الطلب.
- لا توجد حاجة إلى SMS OTP أو بوابة دفع إلكتروني لتدفق التسجيل.

## قالب الرسالة

القالب المعتمد في:

`supabase/templates/customer-confirmation-otp.html`

يعرض رمز `{{ .Token }}` مباشرة، ولا يعتمد على رابط `{{ .ConfirmationURL }}`؛ وهذا يطابق واجهة إدخال الرمز داخل التطبيق.

## مزود الإرسال المختار: Resend

إعدادات SMTP الافتراضية:

| الحقل | القيمة |
|---|---|
| SMTP Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API Key |
| Sender Name | `BURGER HOUSE` |
| Sender Email | عنوان على نطاق موثّق في Resend |

مرجع الإعداد الرسمي: [Resend SMTP](https://resend.com/changelog/smtp-service) و[Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## تهيئة SMTP آليًا

أُضيف سكربت آمن يضبط قالب Confirm signup وخيارات OTP وSMTP في مشروع Supabase الصحيح عبر Management API، ثم يقرأ الإعدادات للتحقق منها. لا يطبع أي سر ولا يكتب الأسرار في Git.

1. أنشئ حساب Resend وأضف نطاقًا تملكه إلى صفحة Domains.
2. أضف سجلات DNS التي يعرضها Resend، وانتظر حتى تصبح حالة النطاق Verified.
3. أنشئ Resend API Key بصلاحية إرسال البريد.
4. أنشئ Supabase Personal Access Token من [Account > Access Tokens](https://supabase.com/dashboard/account/tokens).
5. انسخ `.env.auth-setup.example` إلى `.env.auth-setup` واملأ القيم محليًا. الملف الحقيقي مستثنى من Git عبر `.gitignore`.
6. نفّذ فحص القالب والإعدادات دون إجراء أي تغيير:

```bash
npm run auth:dry-run
```

7. بعد التحقق من النطاق والبيانات، طبّق الإعداد:

```bash
npm run auth:configure
```

السكربت يستهدف مشروع Burger House فقط: `kgmteyikhadzqbscnlfb`. لا يحتاج إلى أي متغير SMTP داخل Vercel؛ بيانات SMTP تحفظ في إعدادات Supabase Auth نفسها.

## ما لا يمكن تفعيله دون حسابات المالك

لا يمكن إكمال إرسال البريد العام أو اختباره إلى عناوين عملاء حقيقية قبل وجود:
- نطاق بريد يملكه المشروع ويمكن إثبات ملكيته عبر DNS.
- Resend API Key.
- Supabase Personal Access Token بصلاحية تحديث إعدادات المشروع.

خدمة Supabase SMTP الافتراضية مخصصة للتجربة المحدودة، وقد ترفض العناوين غير التابعة لأعضاء فريق المشروع؛ لذلك لا تُعد بديلًا صالحًا للإطلاق العام.

## اختبار القبول قبل النشر

- تشغيل `npm run auth:dry-run`.
- تشغيل `npm run auth:configure` والتحقق من نجاح قراءة الإعدادات بعد التحديث.
- إرسال تسجيل تجريبي إلى بريد غير تابع لفريق Supabase.
- التأكد من وصول رمز 6 أرقام، وانتهاء صلاحيته، ومنع إعادة الإرسال المتكرر.
- إكمال التسجيل، ثم تسجيل الخروج والدخول بالبريد وكلمة المرور.
- التأكد من أن رقم الجوال موجود في ملف العميل وأن إنشاء الطلب يطابقه.
