# دليل إعداد Supabase، المتغيرات البيئية، والنشر على GitHub و Vercel

## أولاً: إعداد قاعدة البيانات في Supabase

1. أنشئ مشروعاً جديداً في [Supabase Dashboard](https://supabase.com/dashboard).
2. انتقل إلى قسم **SQL Editor** ونفّذ ملفات الترحيل بالترتيب التالي:
   - `supabase/migrations/001_core_schema.sql` (إنشاء الجداول، الأنواع، ومحفزات منع تغيير الفرع بعد إنشاء الطلب).
   - `supabase/migrations/002_rls_and_security_policies.sql` (تفعيل سياسات Row-Level Security وعزل صلاحيات `super_admin` و `owner` وموظفي الفروع).
   - `supabase/migrations/003_atomic_order_rpc_and_seed.sql` (إنشاء دالة آلة الحالات وإدراج الفروع الافتراضية والمنيو ووسائل الدفع).
3. من قسم **Storage**، أنشئ حاوية (Bucket) باسم `menu-media` واجعل القراءة عامة (Public Read) والرفع مقصوراً على المستخدمين المصرح لهم (`owner` و `super_admin`).
4. من قسم **Database -> Replication**، فعّل Realtime على جدول `public.orders` لتحديث شاشة الموظفين لحظياً.

---

## ثانياً: متغيرات البيئة المطلوبة (`.env.local` وفي Vercel)

لا تقم أبداً برفع ملف `.env.local` إلى GitHub، ولا تضع `SUPABASE_SERVICE_ROLE_KEY` تحت بادئة `NEXT_PUBLIC_`.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_SECRET_KEY
ORDER_HMAC_SECRET=64_CHAR_RANDOM_HEX_SECRET
CAPTCHA_SIGNING_SECRET=64_CHAR_RANDOM_HEX_SECRET
NEXT_PUBLIC_APP_TIMEZONE=Asia/Riyadh
```

---

## ثالثاً: طريقة إنشاء حساب المدير الأعلى (`super_admin`) بأمان

1. سجّل حسابك الشخصي عبر **Supabase Authentication -> Users -> Add User** (مثال: بريدك الشخصي).
2. انسخ الـ `UUID` الخاص بحسابك، ثم نفّذ الاستعلام التالي داخل **Supabase SQL Editor** (الذي يملك صلاحية `postgres` المباشرة):

```sql
INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
VALUES (
  'YOUR-AUTH-USER-UUID',
  'your-email@domain.com',
  'مؤيد محمد الحزمي (System Creator)',
  'super_admin',
  TRUE
)
ON CONFLICT (id) DO UPDATE SET role = 'super_admin', is_active = TRUE;
```

---

## رابعاً: طريقة إنشاء حساب مالك المطعم (`owner`)

يمكنك إنشاؤه من داخل **لوحة الإدارة العليا (`/bh-sovereign-vault`)** أو عبر SQL Editor:

```sql
INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
VALUES (
  'OWNER-AUTH-USER-UUID',
  'owner@burgerhouse.sa',
  'مالك سلسلة برجر هاوس',
  'owner',
  TRUE
);
```

---

## خامساً: طريقة إضافة الفروع وتخصيص أسعارها

1. ادخل إلى **لوحة إدارة المطعم (`/owner-studio`)** -> تبويب **الفروع وساعات العمل**.
2. أدخل اسم الفرع بالعربية والإنجليزية، العنوان التفصيلي، إحداثيات خط العرض والطول (`Latitude / Longitude`)، رقم الهاتف، رابط الخريطة، وساعات العمل.
3. لتخصيص سعر منتج في فرع معين (مثلاً سعر مختلف في فرع الرياض عن فروع جدة)، انتقل إلى تبويب **المنيو وأسعار الفروع** وعدّل السعر الخاص بالفرع (`branch_product_overrides`).

---

## سادساً: الرفع إلى GitHub والنشر على Vercel

```bash
git init
git add .
git commit -m "feat: initial release of BURGER HOUSE Luxury Ordering System"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/burger-house.git
git push -u origin main
```

بعد الرفع إلى GitHub:
1. افتح [Vercel](https://vercel.com) واختر **Add New Project** واربطه بمستودع `burger-house`.
2. أضف متغيرات البيئة المذكورة أعلاه في إعدادات المشروع على Vercel.
3. اضغط **Deploy**.

---

## سابعاً: الميزات التي تحتاج إلى إعدادات أو خدمات خارجية إضافية عند التشغيل الفعلي

- **بوابة الدفع الإلكتروني المباشر (Apple Pay / مدى أونلاين):** وسائل الدفع عند الاستلام (`شبكة عند الاستلام` و `نقداً عند الاستلام`) جاهزة وتعمل فوراً دون أي اشتراك خارجي. أما لتفعيل الخصم المالي المباشر عبر الإنترنت لـ Apple Pay، فيلزم ربط مفتاح API الخاص بمزود دفع سعودي مرخص (مثل **Moyasar** أو **HyperPay** أو **Tap Payments**) وتفعيل شهادة التاجر (Apple Merchant ID).
- **قاعدة بيانات وتخزين سحابي حي:** يتطلب ربط متغيرات `NEXT_PUBLIC_SUPABASE_URL` و `SUPABASE_SERVICE_ROLE_KEY` بمشروع Supabase الفعلي الخاص بك.
