import { ArrowLeft } from 'lucide-react';
import SafeFoodImage from '@/components/safe-food-image';

type StorefrontHeroCopy = {
  heroKickerAr?: string;
  heroTitleAr?: string;
  heroTitleAccentAr?: string;
  heroCtaAr?: string;
};

type StorefrontHeroProps = {
  copy: StorefrontHeroCopy;
  onStartOrder: () => void;
};

export default function StorefrontHero({ copy, onStartOrder }: StorefrontHeroProps) {
  return (
    <>
      <section className="bh-v2-hero" aria-labelledby="bh-home-title">
        <div className="bh-v2-hero-copy">
          <p className="bh-v2-kicker">{copy.heroKickerAr || 'طازج من المطبخ إلى يدك'}</p>
          <h1 id="bh-home-title">
            {copy.heroTitleAr || 'اختَر وجبتك.'}
            <br />
            <em>{copy.heroTitleAccentAr || 'ونحن نجهّز الباقي.'}</em>
          </h1>
          <div className="bh-v2-hero-actions">
            <button type="button" onClick={onStartOrder}>
              {copy.heroCtaAr || 'ابدأ طلبك'} <ArrowLeft size={17} />
            </button>
          </div>
        </div>
        <div className="bh-v2-hero-media">
          <SafeFoodImage
            src="/images/hero-wagyu-smash.jpg"
            categoryId="cat-wagyu"
            alt="برجر واغيو سماش من برجر هاوس"
            loading="eager"
          />
          <div className="bh-v2-media-caption"><span>MADE TO ORDER</span><b>طازج. ساخن. على ذوقك.</b></div>
          <div className="bh-v2-media-index">01 <i>/</i> 03</div>
        </div>
      </section>
      <section className="bh-v2-promise-strip" aria-label="مميزات الطلب">
        <div><span>01</span><b>اختيارك بالكامل</b><small>حجم وإضافات كما تحب</small></div>
        <div><span>02</span><b>تحضير عند الطلب</b><small>يبدأ بعد تأكيد الفرع</small></div>
        <div><span>03</span><b>استلام واضح</b><small>تابع حالة طلبك خطوة بخطوة</small></div>
      </section>
    </>
  );
}
