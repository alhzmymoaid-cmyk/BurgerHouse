'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import SafeFoodImage from '@/components/safe-food-image';

export type PromoBanner = {
  id: string; branch_id: string | null; title_ar: string; subtitle_ar?: string | null;
  image_url: string; badge_text?: string | null; cta_label?: string | null;
  target_url?: string | null; target_product_id?: string | null; target_category_id?: string | null;
  sort_order?: number; starts_at?: string; ends_at?: string | null; is_active?: boolean;
};
type Product = { id: string; category_id: string; name_ar: string; description_ar: string; base_price: number; image_url: string; is_featured?: boolean; prep_minutes?: number; sizes?: { id: string; name_ar: string; price_delta: number; is_default?: boolean }[]; allowed_addon_ids?: string[] };
type Props = { banners?: PromoBanner[]; branchId: string; products?: Product[];
  onOpenProduct?: (product: Product) => void; onSelectCategory?: (id: string) => void };

const DEMO_BANNERS: PromoBanner[] = [
  {
    id: 'bh-demo-new-burger', branch_id: null, title_ar: 'برجر جديد على النار',
    subtitle_ar: 'واغيو طري وخبز بريوش محمّص… جرّبه الآن',
    image_url: '/images/hero-wagyu-smash.jpg', badge_text: 'جديد',
    cta_label: 'اطلب الآن', target_category_id: 'cat-wagyu', sort_order: 1,
  },
  {
    id: 'bh-demo-new-meal', branch_id: null, title_ar: 'عرض الوجبة الجديدة',
    subtitle_ar: 'وجبة متكاملة بسعر خاص لفترة محدودة',
    image_url: 'https://images.pexels.com/photos/5639696/pexels-photo-5639696.jpeg?auto=compress&cs=tinysrgb&w=1200',
    badge_text: 'خصم خاص', cta_label: 'تصفح العرض', target_category_id: 'cat-meals', sort_order: 2,
  },
];

export default function PromoCarousel({ banners = [], branchId, products = [], onOpenProduct, onSelectCategory }: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [active, setActive] = useState(0);
  const visible = useMemo(() => banners.filter((b) => b.is_active !== false &&
    (!b.branch_id || b.branch_id === branchId) &&
    (!b.starts_at || new Date(b.starts_at).getTime() <= Date.now()) &&
    (!b.ends_at || new Date(b.ends_at).getTime() > Date.now())
  ).sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [banners, branchId]);
  const displayBanners = visible.length ? visible : DEMO_BANNERS;

  useEffect(() => {
    if (displayBanners.length < 2) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      setActive((current) => {
        const next = (current + 1) % displayBanners.length;
        rail.current?.children[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        return next;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [displayBanners.length]);

  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const onScroll = () => {
      const cards = Array.from(node.children) as HTMLElement[];
      if (!cards.length) return;
      const center = node.getBoundingClientRect().left + node.clientWidth / 2;
      let closest = 0, distance = Number.POSITIVE_INFINITY;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const d = Math.abs(rect.left + rect.width / 2 - center);
        if (d < distance) { distance = d; closest = index; }
      });
      setActive(closest);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [displayBanners.length]);

  return (
    <section className="bh-promo-section mx-auto max-w-7xl px-4 py-6 lg:px-8" aria-label="عروض برجر هاوس">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><span className="text-[10px] font-black tracking-[.2em] text-[#F5B800]">BURGER HOUSE OFFERS</span>
          <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">عروض برجر هاوس</h2>
          <p className="mt-1 text-xs text-[#A1A1AA]">اختيارات وعروض مميزة من فروعنا</p></div>
        <span className="text-[10px] text-[#A1A1AA]">{visible.length ? `${visible.length} عروض` : 'عروض مختارة'}</span>
      </div>
      <div ref={rail} dir="rtl" className="bh-promo-rail flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-2" onPointerDown={() => { paused.current = true; }} onWheel={() => { paused.current = true; }} onFocus={() => { paused.current = true; }}>
        {displayBanners.map((banner) => {
          const product = banner.target_product_id ? products.find((p) => p.id === banner.target_product_id) : undefined;
          const action = () => {
            if (product && onOpenProduct) onOpenProduct(product);
            else if (banner.target_category_id && onSelectCategory) { onSelectCategory(banner.target_category_id); document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' }); }
            else if (banner.target_url) window.location.assign(banner.target_url);
            else document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' });
          };
          const categoryId = banner.target_category_id || (banner.id === 'bh-demo-new-meal' ? 'cat-meals' : 'cat-wagyu');
          return <article key={banner.id} className="bh-promo-card relative isolate shrink-0 snap-center overflow-hidden rounded-2xl">
            <SafeFoodImage src={banner.image_url} categoryId={categoryId} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090B]/95 via-[#09090B]/25 to-transparent" />
            <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-[10px] font-black text-[#FFD036] backdrop-blur">{banner.badge_text || 'عرض اليوم'}</span>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h3 className="text-base font-black text-white sm:text-lg">{banner.title_ar}</h3>
              {banner.subtitle_ar && <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-white/80">{banner.subtitle_ar}</p>}
              <button type="button" onClick={action} className="mt-2 inline-flex min-h-9 items-center rounded-lg bg-[#F5B800] px-4 text-[11px] font-black text-[#09090B]">{banner.cta_label || 'اطلب الآن'}</button>
            </div>
          </article>;
        })}
      </div>
      {displayBanners.length > 1 && <div className="mt-2 flex justify-center gap-2" aria-label="مؤشر العروض">
        {displayBanners.map((banner,index) => <button key={banner.id} type="button" aria-label={`العرض ${index+1}`} onClick={() => { paused.current = true; setActive(index); rail.current?.children[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }} className={index===active?'h-1.5 w-5 rounded-full bg-[#F5B800]':'h-1.5 w-1.5 rounded-full bg-white/25'} />)}
      </div>}
    </section>
  );
}
