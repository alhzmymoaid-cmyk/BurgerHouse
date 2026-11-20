'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type PromoBanner = {
  id: string; branch_id: string | null; title_ar: string; subtitle_ar?: string | null;
  image_url: string; badge_text?: string | null; cta_label?: string | null;
  target_url?: string | null; target_product_id?: string | null; target_category_id?: string | null;
  sort_order?: number; starts_at?: string; ends_at?: string | null; is_active?: boolean;
};
type Product = { id: string; category_id: string; name_ar: string; description_ar: string; base_price: number; image_url: string; is_featured?: boolean; prep_minutes?: number; sizes?: { id: string; name_ar: string; price_delta: number; is_default?: boolean }[]; allowed_addon_ids?: string[] };
type Props = { banners?: PromoBanner[]; branchId: string; products?: Product[];
  onOpenProduct?: (product: Product) => void; onSelectCategory?: (id: string) => void };

export default function PromoCarousel({ banners = [], branchId, products = [], onOpenProduct, onSelectCategory }: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const [active, setActive] = useState(0);
  const visible = useMemo(() => banners.filter((b) => b.is_active !== false &&
    (!b.branch_id || b.branch_id === branchId) &&
    (!b.starts_at || new Date(b.starts_at).getTime() <= Date.now()) &&
    (!b.ends_at || new Date(b.ends_at).getTime() > Date.now())
  ).sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [banners, branchId]);

  useEffect(() => {
    if (visible.length < 2) return;
    const timer = window.setInterval(() => {
      if (paused.current) return;
      setActive((current) => {
        const next = (current + 1) % visible.length;
        rail.current?.children[next]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        return next;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [visible.length]);

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
  }, [visible.length]);

  if (!visible.length) return null;
  return (
    <section className="bh-promo-section mx-auto max-w-7xl px-4 py-8 lg:px-8" aria-label="عروض برجر هاوس">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><span className="text-[10px] font-black tracking-[.2em] text-[#F5B800]">BURGER HOUSE OFFERS</span>
          <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">عروض برجر هاوس</h2>
          <p className="mt-1 text-xs text-[#A1A1AA]">اختيارات وعروض مميزة من فروعنا</p></div>
        <span className="text-[10px] text-[#A1A1AA]">{visible.length} عروض</span>
      </div>
      <div ref={rail} dir="rtl" className="bh-promo-rail flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-3" onPointerDown={() => { paused.current = true; }} onWheel={() => { paused.current = true; }} onFocus={() => { paused.current = true; }}>
        {visible.map((banner) => {
          const product = banner.target_product_id ? products.find((p) => p.id === banner.target_product_id) : undefined;
          const action = () => {
            if (product && onOpenProduct) onOpenProduct(product);
            else if (banner.target_category_id && onSelectCategory) { onSelectCategory(banner.target_category_id); document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' }); }
            else if (banner.target_url) window.location.assign(banner.target_url);
            else document.getElementById('menu-section')?.scrollIntoView({ behavior: 'smooth' });
          };
          return <article key={banner.id} className="bh-promo-card relative isolate shrink-0 snap-center overflow-hidden rounded-3xl" style={{ backgroundImage: `linear-gradient(0deg,rgba(9,9,11,.96),rgba(9,9,11,.06) 72%),url("${banner.image_url}")` }}>
            <span className="absolute right-4 top-4 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-[10px] font-black text-[#FFD036] backdrop-blur">{banner.badge_text || 'عرض اليوم'}</span>
            <div className="absolute inset-x-0 bottom-0 p-5">
              <h3 className="text-lg font-black text-white">{banner.title_ar}</h3>
              {banner.subtitle_ar && <p className="mt-1 line-clamp-2 text-xs leading-6 text-white/75">{banner.subtitle_ar}</p>}
              <button type="button" onClick={action} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#F5B800] px-5 text-xs font-black text-[#09090B]">{banner.cta_label || 'اطلب الآن'}</button>
            </div>
          </article>;
        })}
      </div>
      {visible.length > 1 && <div className="mt-3 flex justify-center gap-2" aria-label="مؤشر العروض">
        {visible.map((banner,index) => <button key={banner.id} type="button" aria-label={`العرض ${index+1}`} onClick={() => { paused.current = true; setActive(index); rail.current?.children[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }} className={index===active?'h-2 w-6 rounded-full bg-[#F5B800]':'h-2 w-2 rounded-full bg-white/25'} />)}
      </div>}
    </section>
  );
}
