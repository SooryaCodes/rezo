import type { Config } from "tailwindcss";

/**
 * The design system, expressed once.
 *
 * Surfaces rise toward white rather than away from it, text has four voices
 * instead of four numbers, and the accent is reserved for state so it stays a
 * signal. The primary action is achromatic on purpose: if the accent were also
 * the button colour it would stop meaning anything.
 */
const config: Config = {
  // One theme, committed to. This selector never matches, so a stray `dark:`
  // utility is inert instead of firing off the visitor's OS preference — which
  // is exactly what once turned this page dark while its text stayed dark too.
  darkMode: ["selector", "[data-theme='dark']"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          4: "var(--surface-4)",
        },
        line: {
          subtle: "var(--border-subtle)",
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        ink: {
          DEFAULT: "var(--text)",
          2: "var(--text-2)",
          3: "var(--text-3)",
          4: "var(--text-4)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          line: "var(--accent-line)",
        },
        action: {
          DEFAULT: "var(--action)",
          hover: "var(--action-hover)",
          ink: "var(--action-ink)",
        },
        bad: {
          DEFAULT: "var(--danger)",
          soft: "var(--danger-soft)",
          line: "var(--danger-line)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "Menlo", "monospace"],
      },
      fontSize: {
        // Body sits at 13.5px: an app size, not a document size.
        "2xs": ["10.5px", { lineHeight: "1.4" }],
        xs: ["11.5px", { lineHeight: "1.45" }],
        sm: ["12.5px", { lineHeight: "1.5" }],
        base: ["13.5px", { lineHeight: "1.55" }],
        md: ["15px", { lineHeight: "1.6" }],
        lg: ["17px", { lineHeight: "1.4" }],
        xl: ["21px", { lineHeight: "1.3" }],
        "2xl": ["27px", { lineHeight: "1.2" }],
        "3xl": ["34px", { lineHeight: "1.15" }],
        "4xl": ["44px", { lineHeight: "1.08" }],
        "5xl": ["62px", { lineHeight: "1.03" }],
      },
      fontWeight: {
        // Variable-font intermediates read more considered than 400/500/600/700.
        normal: "400",
        medium: "510",
        semibold: "560",
        bold: "590",
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.03em",
        tight: "-0.018em",
        wide: "0.09em",
      },
      borderRadius: {
        xs: "3px",
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        // Multi-layer, because a single blurred shadow is the uncrafted tell.
        1: "0 1px 2px rgba(24,24,27,.06)",
        2: "0 1px 3px rgba(24,24,27,.08), 0 6px 16px rgba(24,24,27,.06)",
        3: "0 2px 6px rgba(24,24,27,.08), 0 20px 48px rgba(24,24,27,.14)",
        ring: "inset 0 0 0 1px rgba(24,24,27,.07)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.16, 1, 0.3, 1)" },
      transitionDuration: { fast: "110ms", base: "180ms", slow: "280ms" },
      maxWidth: { shell: "1120px", prose: "68ch" },
    },
  },
  plugins: [],
};

export default config;
