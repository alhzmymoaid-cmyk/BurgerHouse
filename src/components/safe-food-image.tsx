'use client';

import { useEffect, useMemo, useState } from 'react';

type SafeFoodImageProps = {
  src?: string | null;
  categoryId?: string | null;
  alt: string;
  className?: string;
  loading?: 'eager' | 'lazy';
};

const FALLBACK_BY_CATEGORY: Record<string, string> = {
  'cat-wagyu': '/images/hero-wagyu-smash.jpg',
  'cat-chicken': '/images/nashville-hot-chicken.jpg',
  'cat-sides': '/images/loaded-cheddar-fries.jpg',
  'cat-drinks': '/images/salted-caramel-shake.jpg',
  'cat-meals': '/images/smoked-brisket-burger.jpg',
  'cat-desserts': '/images/salted-caramel-shake.jpg',
};

const DEFAULT_FALLBACK = '/images/hero-wagyu-smash.jpg';
const LAST_LOCAL_FALLBACKS = [
  '/images/smoked-brisket-burger.jpg',
  '/images/loaded-cheddar-fries.jpg',
  '/images/nashville-hot-chicken.jpg',
];

export default function SafeFoodImage({ src, categoryId, alt, className = '', loading = 'lazy' }: SafeFoodImageProps) {
  const fallback = FALLBACK_BY_CATEGORY[categoryId || ''] || DEFAULT_FALLBACK;
  const sources = useMemo(
    () => Array.from(new Set([src?.trim(), fallback, DEFAULT_FALLBACK, ...LAST_LOCAL_FALLBACKS].filter((value): value is string => Boolean(value)))),
    [src, fallback]
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [allSourcesFailed, setAllSourcesFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setAllSourcesFailed(false);
  }, [sources]);

  if (allSourcesFailed) {
    return <span className={className} role="img" aria-label={alt} data-image-fallback="exhausted" />;
  }

  return (
    <img
      src={sources[sourceIndex] || DEFAULT_FALLBACK}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => {
        setSourceIndex((current) => {
          if (current + 1 >= sources.length) {
            setAllSourcesFailed(true);
            return current;
          }
          return current + 1;
        });
      }}
    />
  );
}
