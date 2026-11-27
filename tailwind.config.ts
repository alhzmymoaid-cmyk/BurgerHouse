import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bh: {
          bg: 'var(--bh-bg)',
          surface: 'var(--bh-surface)',
          card: 'var(--bh-card)',
          raised: 'var(--bh-card-raised)',
          line: 'var(--bh-line)',
          text: 'var(--bh-text)',
          muted: 'var(--bh-muted)',
          accent: 'var(--bh-accent)',
          'accent-strong': 'var(--bh-accent-strong)',
          success: 'var(--bh-success)',
          danger: 'var(--bh-danger)',
          warning: 'var(--bh-warning)',
        },
        obsidian: '#101113',
        charcoal: '#17191c',
        slateCard: '#1e2125',
        ivoryCream: '#f7f1e8',
        mutedStone: '#aaa49a',
        emberGold: '#e6b65b',
        emberGoldHover: '#f2c66d',
        flameSear: '#e6b65b',
      },
      borderRadius: {
        'bh-card': 'var(--bh-radius-card)',
        'bh-control': 'var(--bh-radius-control)',
      },
      boxShadow: {
        'bh-card': 'var(--bh-shadow-card)',
      },
      fontFamily: {
        arabic: ['IBM Plex Sans Arabic', 'Cairo', 'sans-serif'],
        display: ['IBM Plex Sans Arabic', 'Cairo', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
