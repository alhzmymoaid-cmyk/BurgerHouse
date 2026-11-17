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
        obsidian: '#0B0A09',
        espresso: '#141210',
        slateCard: '#1C1916',
        emberGold: '#D49A3A',
        flameSear: '#B84A27',
        ivoryCream: '#F5EFE6',
        mutedStone: '#9E9488',
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
