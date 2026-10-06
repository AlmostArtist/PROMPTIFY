/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx}', './sidepanel.html', './mic.html'],
  theme: {
    extend: {
      colors: {
        forge: {
          bg:      '#0D0D0D',
          panel:   '#161616',
          surface: '#1E1E1E',
          border:  '#262626',
          text:    '#FFFFFF',
          muted:   '#888888',
          faint:   '#555555',
          primary: '#FFFFFF',
          mint:    '#DDF7DD',
          sky:     '#DFF5FF',
          lavender:'#F1D9FF',
          yellow:  '#FFF3BF',
          green:   '#D8F8D8',
          pink:    '#FFDFF4',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'SF Pro Text', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      borderRadius: {
        'pill': '999px',
        'card': '20px',
        'card-lg': '28px',
      },
      boxShadow: {
        'premium-sm': '0 1px 3px rgba(0,0,0,0.05)',
        'premium-md': '0 4px 16px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)',
        'premium-lg': '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        'premium-xl': '0 16px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
        'dark-sm':    '0 1px 3px rgba(0,0,0,0.4)',
        'dark-md':    '0 4px 16px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
        'dark-lg':    '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
      },
      keyframes: {
        'p-fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'p-scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'p-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'p-fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pf-rail-in': {
          '0%':   { opacity: '0', transform: 'translateX(10px) scale(0.88)' },
          '55%':  { opacity: '1', transform: 'translateX(-1px) scale(1.03)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'pf-tooltip-in': {
          '0%':   { opacity: '0', filter: 'blur(3px)' },
          '100%': { opacity: '1', filter: 'blur(0)' },
        },
        'pf-dot-breathe': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%':      { transform: 'scale(1.3)', opacity: '1' },
        },
        'pf-toast-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pf-card-pop': {
          '0%':   { opacity: '0', transform: 'scale(0.85)' },
          '60%':  { opacity: '1', transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'p-fade-up':   'p-fade-up 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'p-scale-in':  'p-scale-in 0.22s cubic-bezier(0.34,1.56,0.64,1) both',
        'p-spin':      'p-spin 0.7s linear infinite',
        'p-fade-in':   'p-fade-in 0.2s ease both',
        'pf-rail-in':  'pf-rail-in 0.36s cubic-bezier(0.34,1.56,0.64,1) both',
        'pf-tooltip-in':'pf-tooltip-in 0.18s ease both',
        'pf-dot-breathe':'pf-dot-breathe 2.5s ease-in-out infinite',
        'pf-toast-in': 'pf-toast-in 0.25s cubic-bezier(0.34,1.56,0.64,1) both',
        'pf-card-pop': 'pf-card-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
      },
    },
  },
  plugins: [],
};
