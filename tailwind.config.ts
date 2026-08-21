import type { Config } from 'tailwindcss'

// Tokens are DESIGN.md §1–§6. Components use these names, never raw hex.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      paper: '#F6F5F1',
      ink: '#1D1F1C',
      rule: '#D9D7CF',
      typed: '#2B4C6B',
      derived: '#5E7A6B',
      attention: '#B5762E',
      white: '#FFFFFF',
    },
    spacing: {
      0: '0px',
      1: '4px',
      2: '8px',
      3: '12px',
      4: '16px',
      6: '24px',
      8: '32px',
      12: '48px',
      16: '64px',
      24: '96px',
      32: '128px',
      px: '1px',
      full: '100%',
    },
    borderRadius: { none: '0px', DEFAULT: '2px' },
    fontSize: {
      sm: ['14px', '20px'],
      base: ['16px', '24px'],
      lg: ['18px', '26px'],
      xl: ['22px', '30px'],
      '2xl': ['28px', '36px'],
    },
    fontWeight: { normal: '400', medium: '500', semibold: '600' },
    extend: {
      fontFamily: {
        sans: ['var(--font-public-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      borderWidth: { hairline: '0.5px' },
      transitionDuration: { fast: '120ms', state: '240ms', mark: '500ms' },
      transitionTimingFunction: { house: 'cubic-bezier(0.2,0,0,1)' },
      backgroundImage: {
        // --unmapped is a pattern, not a colour: it marks an absence. DESIGN.md §3.
        unmapped:
          'repeating-linear-gradient(45deg, transparent, transparent 4px, #D9D7CF 4px, #D9D7CF 5px)',
      },
    },
  },
  plugins: [],
}

export default config
