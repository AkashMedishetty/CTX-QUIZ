import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary (CTX Teal)
        primary: {
          DEFAULT: '#275249',
          light: '#3a7a6d',
          dark: '#1a3832',
          50: '#f0f9f7',
          100: '#d9f0eb',
          200: '#b3e1d7',
          300: '#80cbbe',
          400: '#4dab9c',
          500: '#275249',
          600: '#22493f',
          700: '#1d3f36',
          800: '#18352d',
          900: '#132b24',
        },
        // Accent (CTX)
        accent: {
          DEFAULT: '#6B3093',
          light: '#8a4db8',
          dark: '#4d2269',
          50: '#f9f5fc',
          100: '#f0e6f7',
          200: '#e0ccef',
          300: '#c9a3e2',
          400: '#a86dcf',
          500: '#6B3093',
          600: '#5c2a7f',
          700: '#4d236b',
          800: '#3e1d57',
          900: '#2f1643',
        },
        // Semantic colors
        success: {
          DEFAULT: '#22C55E',
          light: '#4ade80',
          dark: '#16a34a',
        },
        error: {
          DEFAULT: '#EF4444',
          light: '#f87171',
          dark: '#dc2626',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#fbbf24',
          dark: '#d97706',
        },
        info: {
          DEFAULT: '#3B82F6',
          light: '#60a5fa',
          dark: '#2563eb',
        },
        // Neumorphism base colors (Light Mode)
        neu: {
          bg: '#E8ECEF',
          surface: '#F0F4F7',
          'shadow-dark': '#C8CCD0',
          'shadow-light': '#FFFFFF',
        },
        // Neumorphism base colors (Dark Mode)
        'neu-dark': {
          bg: '#1A1D21',
          surface: '#22262B',
          'shadow-dark': '#0F1114',
          'shadow-light': '#2A2F35',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'display-xl': ['72px', { lineHeight: '1.0' }],
        'display': ['48px', { lineHeight: '1.1' }],
        'h1': ['36px', { lineHeight: '1.2' }],
        'h2': ['28px', { lineHeight: '1.3' }],
        'h3': ['22px', { lineHeight: '1.4' }],
        'body-lg': ['18px', { lineHeight: '1.5' }],
        'body': ['16px', { lineHeight: '1.5' }],
        'body-sm': ['14px', { lineHeight: '1.5' }],
        'caption': ['12px', { lineHeight: '1.4' }],
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
      },
      boxShadow: {
        // Light mode neumorphic shadows
        'neu-raised': '8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light)',
        'neu-raised-lg': '12px 12px 24px var(--shadow-dark), -12px -12px 24px var(--shadow-light)',
        'neu-raised-sm': '4px 4px 8px var(--shadow-dark), -4px -4px 8px var(--shadow-light)',
        'neu-pressed': 'inset 4px 4px 8px var(--shadow-dark), inset -4px -4px 8px var(--shadow-light)',
        'neu-pressed-sm': 'inset 2px 2px 4px var(--shadow-dark), inset -2px -2px 4px var(--shadow-light)',
        // Flat shadow for hover states
        'neu-flat': '0 0 0 transparent',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'fade-out': 'fadeOut 0.3s ease-in',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'scale-out': 'scaleOut 0.2s ease-in',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-subtle': 'bounceSubtle 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'shake': 'shake 0.5s ease-in-out',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        scaleOut: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.95)', opacity: '0' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
      },
      transitionDuration: {
        'instant': '100ms',
        'fast': '200ms',
        'normal': '300ms',
        'slow': '500ms',
        'slower': '800ms',
      },
      transitionTimingFunction: {
        'ease-out-custom': 'cubic-bezier(0.0, 0.0, 0.2, 1)',
        'ease-in-custom': 'cubic-bezier(0.4, 0.0, 1, 1)',
        'ease-in-out-custom': 'cubic-bezier(0.4, 0.0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '112': '28rem',
        '128': '32rem',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
    },
  },
  plugins: [],
};

export default config;
