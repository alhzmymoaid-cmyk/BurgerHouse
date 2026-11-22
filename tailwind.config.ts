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
        obsidian: '#0A0A0C',
        charcoal: '#151519',
        slateCard: '#1C1C22',
        ivoryCream: '#F6F3EC',
        mutedStone: '#B4B4BE',
        emberGold: '#F5B800',
        emberGoldHover: '#FFCA28',
        flameSear: '#EF4444',
      },
      fontFamily: {
        arabic: ['Tajawal', 'Cairo', 'sans-serif'],
        display: ['Playfair Display', 'Tajawal', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
