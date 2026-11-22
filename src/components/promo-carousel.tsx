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
  { id: 'bh-demo-new-burger', branch_id: null, title_ar: 'برجر جديد على النار', image_url: '/images/hero-wagyu-smash.jpg', target_category_id: 'cat-wagyu', sort_order: 1 },
  { id: 'bh-demo-new-meal', branch_id: null, title_ar: 'عرض الوجبة الجديدة', image_url: '/images/smoked-brisket-burger.jpg', target_category_id: 'cat-meals', sort_order: 2 },
];

export default function PromoCarousel({ banners = [], branchId, products = [], onOpenProduct, onSelectCategory }: Props) {
  const rail = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const activeRef = useRef(0);
  const [active, setActive] = useState(0);
  const scrollToBanner = (index: number) => {
    const container = rail.current;
    const target = container?.children[index] as HTMLElement | undefined;
    if (!container || !target) return;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const delta = targetRect.left + targetRect.width / 2 - (containerRect.left + container.clientWidth / 2);
    container.scrollTo({ left: container.scrollLeft + delta, behavior: 'smooth' });
  };
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
      const next = (activeRef.current + 1) % displayBanners.length;
      activeRef.current = next;
      setActive(next);
      scrollToBanner(next);
    }, 4500);
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
      activeRef.current = closest;
      setActive(closest);
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [displayBanners.length]);

  return (
    <section className="bh-promo-section mx-auto max-w-7xl px-4 py-6 lg:px-8" aria-label="عروض برجر هاوس">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <span className="text-[10px] font-semibold tracking-[.16em] text-[#F2B705]">BURGER HOUSE</span>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">العروض</h2>
        </div>
        <span className="text-[10px] text-[#9E9BA3]">{visible.length ? `${visible.length} عروض` : 'عروض مختارة'}</span>
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
          return (
            <button key={banner.id} type="button" className="bh-promo-card group relative block shrink-0 snap-center overflow-hidden rounded-2xl text-start" onClick={action} aria-label={banner.title_ar || 'عرض برجر هاوس'}>
              <SafeFoodImage src={banner.image_url} categoryId={categoryId} alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
      {displayBanners.length > 1 && <div className="mt-2 flex justify-center gap-2" aria-label="مؤشر العروض">
        {displayBanners.map((banner,index) => <button key={banner.id} type="button" aria-label={`العرض ${index+1}`} onClick={() => { paused.current = true; activeRef.current = index; setActive(index); scrollToBanner(index); }} className={index===active?'h-1.5 w-5 rounded-full bg-[#F2B705]':'h-1.5 w-1.5 rounded-full bg-white/25'} />)}
      </div>}
    </section>
  );
}
