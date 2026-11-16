import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        mosque: {
          deep: '#0e2a14',
          forest: '#1a3c21',
          emerald: '#2f7a3f',
          mint: '#8fd4a0',
          gold: '#c9a227',
          goldLight: '#e3c25a',
          muted: '#cdd8cb',
          goldDark: '#8f7115',
          cream: '#f6f4ec',
          ink: '#1c2b25'
        }
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'var(--font-naskh)', 'system-ui', 'sans-serif']
      },
      keyframes: {
        slideIn: {
          from: { opacity: '0', transform: 'translateY(-16px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(201,162,39,0.35)' },
          '50%': { boxShadow: '0 0 0 10px rgba(201,162,39,0)' }
        }
      },
      animation: {
        slideIn: 'slideIn 0.4s ease',
        pulseGlow: 'pulseGlow 1.6s infinite'
      }
    }
  },
  plugins: []
};

export default config;
