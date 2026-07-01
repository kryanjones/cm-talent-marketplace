import type { Config } from "tailwindcss";

/**
 * Theme is driven entirely by BRAND.md tokens, surfaced as CSS variables in
 * app/globals.css. Components reference these semantic names, never raw hex.
 * Re-skinning is a single-file change (globals.css).
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette
        white: "var(--cm-white)",
        "light-grey": "var(--cm-light-grey)",
        red: "var(--cm-red)",
        black: "var(--cm-black)",
        "placeholder-grey": "var(--cm-placeholder-grey)",
        indigo: "var(--cm-indigo)",
        sage: "var(--cm-sage)",
        // Functional aliases
        bg: "var(--cm-bg)",
        "bg-alt": "var(--cm-bg-alt)",
        accent: "var(--cm-accent)",
        ink: "var(--cm-ink)",
        "ink-inverse": "var(--cm-ink-inverse)",
        // Semantic
        success: "var(--cm-success)",
        warning: "var(--cm-warning)",
        error: "var(--cm-error)",
        info: "var(--cm-info)",
      },
      borderColor: {
        hairline: "var(--cm-hairline)",
        DEFAULT: "var(--cm-hairline)",
      },
      fontFamily: {
        serif: "var(--cm-font-serif)",
        sans: "var(--cm-font-sans)",
        mono: "var(--cm-font-mono)",
      },
      fontSize: {
        // Web-scaled from the 1920x1080 slide scale in BRAND.md
        display: ["clamp(3.5rem, 8vw, 6rem)", { lineHeight: "1.0", letterSpacing: "-0.015em" }],
        hero: ["clamp(2.75rem, 6vw, 4.25rem)", { lineHeight: "1.05", letterSpacing: "-0.015em" }],
        title: ["clamp(2rem, 4vw, 3rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        h1: ["2rem", { lineHeight: "1.04", letterSpacing: "-0.02em" }],
        h2: ["1.5rem", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
        h3: ["1.25rem", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
        "body-lg": ["1.125rem", { lineHeight: "1.4" }],
        body: ["1rem", { lineHeight: "1.5" }],
        label: ["0.8125rem", { lineHeight: "1.3", letterSpacing: "0.04em" }],
        fine: ["0.6875rem", { lineHeight: "1.3", letterSpacing: "0.04em" }],
      },
      spacing: {
        // 8px base scale from BRAND.md
        "1": "4px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "6": "24px",
        "8": "32px",
        "12": "48px",
        "15": "60px",
        "20": "80px",
        "32": "128px",
        "42": "168px",
      },
      borderRadius: {
        // Editorial aesthetic: sharp corners by default.
        none: "0",
        DEFAULT: "0",
      },
      boxShadow: {
        slide: "0 0 3px rgba(0,0,0,0.3), 0 5px 20px rgba(0,0,0,0.1)",
        card: "0 1px 2px rgba(0,0,0,0.06)",
        "card-hover": "0 8px 30px rgba(0,0,0,0.10)",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        micro: "120ms",
        standard: "280ms",
        expressive: "450ms",
      },
      maxWidth: {
        content: "1440px",
      },
    },
  },
  plugins: [],
};

export default config;
