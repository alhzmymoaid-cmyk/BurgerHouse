'use client';

import { useState } from 'react';

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
  'cat-meals': 'https://images.pexels.com/photos/5639696/pexels-photo-5639696.jpeg?auto=compress&cs=tinysrgb&w=1200',
  'cat-desserts': 'https://images.pexels.com/photos/33312981/pexels-photo-33312981.jpeg?auto=compress&cs=tinysrgb&w=1200',
};

const DEFAULT_FALLBACK = '/images/hero-wagyu-smash.jpg';
const LAST_RESORT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 480'%3E%3Crect width='640' height='480' fill='%23131317'/%3E%3Ctext x='50%25' y='52%25' fill='%23f5c542' font-size='76' text-anchor='middle' dominant-baseline='middle'%3E%E2%9C%A6%3C/text%3E%3C/svg%3E";

export default function SafeFoodImage({ src, categoryId, alt, className = '', loading = 'lazy' }: SafeFoodImageProps) {
  const fallback = FALLBACK_BY_CATEGORY[categoryId || ''] || DEFAULT_FALLBACK;
  const [imageSrc, setImageSrc] = useState(src?.trim() || fallback);
  const [fallbackFailed, setFallbackFailed] = useState(false);

  return (
    <img
      src={fallbackFailed ? LAST_RESORT : imageSrc}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      onError={() => {
        if (fallbackFailed) return;
        if (imageSrc !== fallback) setImageSrc(fallback);
        else setFallbackFailed(true);
      }}
    />
  );
}
