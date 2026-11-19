# إعداد التحقق بالبريد الإلكتروني (OTP)

تم تجهيز واجهة التسجيل والتحقق في التطبيق لتستخدم رمز Supabase OTP من 6 أرقام عبر `verifyOtp({ type: 'signup' })`.

## إعداد Supabase المطلوب مرة واحدة

افتح [Auth > Email Templates](https://supabase.com/dashboard/project/kgmteyikhadzqbscnlfb/auth/templates) في مشروع Burger House:

1. افتح قالب **Confirm signup**.
2. اجعل العنوان: `رمز التحقق لحسابك في BURGER HOUSE`.
3. استبدل محتوى القالب بمحتوى الملف `supabase/templates/customer-confirmation-otp.html`.
4. تأكد أن القالب يحتوي `{{ .Token }}` ويعرض الرمز، ولا يعتمد على `{{ .ConfirmationURL }}`.
5. من **Auth > Providers > Email** فعّل Email provider وفعّل Confirm email.
6. قبل الإطلاق العام، اربط SMTP مخصصًا موثوقًا من إعدادات SMTP في Supabase، واختبر وصول الرسائل وإعادة إرسال الرمز.

## سلوك التطبيق

- إنشاء حساب بالبريد وكلمة مرور.
- إرسال رمز تأكيد من 6 أرقام عبر قالب تأكيد التسجيل.
- التحقق باستخدام نوع `signup`.
- إعادة إرسال الرمز باستخدام `resend({ type: 'signup' })`.
- تسجيل الدخول بالبريد وكلمة المرور.
- لا يسمح API بإنشاء طلب ما لم يكن البريد مؤكدًا.
- رقم الجوال يُطلب عند إتمام الطلب لاستلام تحديثات الفرع؛ لا يلزم SMS OTP.

> ملاحظة: ملفات SQL لا تغيّر إعدادات قوالب البريد في مشروع Supabase المستضاف. يجب تطبيق قالب البريد وإعداد SMTP من لوحة Supabase نفسها.
