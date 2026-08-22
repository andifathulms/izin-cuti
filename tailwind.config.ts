import type { Config } from 'tailwindcss'

/**
 * Tokens are DESIGN.md §1–§6, and they are declared once — in `globals.css`.
 * This file names them; it does not hold values. A hex here and a hex there
 * is how a palette drifts into two palettes.
 *
 * Colours come through as channels so an alpha modifier (`bg-typed/10`) still
 * works, while `var(--typed)` stays usable in plain CSS.
 */
const channel = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      paper: channel('paper'),
      ink: channel('ink'),
      // Two muted greys, both above 4.5:1 on paper. Every `text-ink/50` this
      // replaced was 3.2:1 — including the privacy line, which is the one
      // claim in the app that has to be read to count.
      'ink-muted': channel('ink-muted'),
      'ink-subtle': channel('ink-subtle'),
      rule: channel('rule'),
      typed: channel('typed'),
      derived: channel('derived'),
      attention: channel('attention'),
      white: channel('white'),
    },
    spacing: {
      0: '0px',
      1: 'var(--space-1)',
      2: 'var(--space-2)',
      3: 'var(--space-3)',
      4: 'var(--space-4)',
      6: 'var(--space-6)',
      8: 'var(--space-8)',
      12: 'var(--space-12)',
      16: 'var(--space-16)',
      24: 'var(--space-24)',
      32: 'var(--space-32)',
      px: '1px',
      full: '100%',
    },
    borderRadius: { none: '0px', DEFAULT: 'var(--radius)' },
    fontSize: {
      sm: ['var(--text-sm)', 'var(--text-sm-lh)'],
      base: ['var(--text-base)', 'var(--text-base-lh)'],
      lg: ['var(--text-lg)', 'var(--text-lg-lh)'],
      xl: ['var(--text-xl)', 'var(--text-xl-lh)'],
      '2xl': ['var(--text-2xl)', 'var(--text-2xl-lh)'],
    },
    fontWeight: { normal: '400', medium: '500', semibold: '600' },
    extend: {
      fontFamily: {
        sans: ['var(--font-public-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      borderWidth: { hairline: 'var(--hairline)' },
      transitionDuration: { fast: '120ms', state: '240ms', mark: '500ms' },
      transitionTimingFunction: { house: 'cubic-bezier(0.2,0,0,1)' },
      backgroundImage: {
        // --unmapped is a pattern, not a colour: it marks an absence. DESIGN.md §3.
        unmapped:
          'repeating-linear-gradient(45deg, transparent, transparent 4px, var(--rule) 4px, var(--rule) 5px)',
      },
    },
  },
  plugins: [],
}

export default config
