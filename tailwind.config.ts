import type { Config } from "tailwindcss";

// UNIQAssess palettes.
//
// "Observatory" (the `uq.*` group below) is the Premium Dark / AI-native theme
// used on the candidate assessment experience (/assess) and the admin/marking
// surfaces ((admin) group). Every token is a CSS variable defined on the
// `.uq-dark` wrapper in globals.css, so the utilities here are a single source
// of truth and the theme is scoped — the public landing/login stay light.
//
// The legacy navy/crimson/teal palettes are kept for now (navy is still used by
// a few light surfaces); prune in a follow-up once fully migrated.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Wire the already-loaded Geist faces (next/font/local in layout.tsx).
        // Previously the body fell back to Arial — these make font-sans /
        // font-mono resolve to Geist everywhere.
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // ---- Observatory dark tokens (bg-uq-elev1, text-uq-2, bg-uq-accent-soft, …)
        uq: {
          DEFAULT: "var(--uq-text)", // text-uq → primary ink
          bg: "var(--uq-bg)",
          bg2: "var(--uq-bg-2)",
          elev1: "var(--uq-elev-1)",
          elev2: "var(--uq-elev-2)",
          elev3: "var(--uq-elev-3)",
          glass: "var(--uq-glass)",
          "glass-strong": "var(--uq-glass-strong)",
          "glass-subtle": "var(--uq-glass-subtle)",
          text: "var(--uq-text)",
          "text-2": "var(--uq-text-2)",
          "text-3": "var(--uq-text-3)",
          "text-on-accent": "var(--uq-text-on-accent)",
          accent: "var(--uq-accent)",
          "accent-hover": "var(--uq-accent-hover)",
          "accent-press": "var(--uq-accent-press)",
          "accent-soft": "var(--uq-accent-soft)",
          "accent-line": "var(--uq-accent-line)",
          cyan: "var(--uq-cyan)",
          persona: "var(--uq-persona)",
          "persona-soft": "var(--uq-persona-soft)",
          border: "var(--uq-border)",
          "border-strong": "var(--uq-border-strong)",
          "border-faint": "var(--uq-border-faint)",
          success: "var(--uq-success)",
          "success-soft": "var(--uq-success-soft)",
          "success-line": "var(--uq-success-line)",
          "success-text": "var(--uq-success-text)",
          warn: "var(--uq-warn)",
          "warn-soft": "var(--uq-warn-soft)",
          "warn-line": "var(--uq-warn-line)",
          "warn-text": "var(--uq-warn-text)",
          danger: "var(--uq-danger)",
          "danger-soft": "var(--uq-danger-soft)",
          "danger-line": "var(--uq-danger-line)",
          "danger-text": "var(--uq-danger-text)",
        },
        navy: {
          DEFAULT: "#1B3A5C",
          50: "#EDF4F7",
          100: "#D4E1EA",
          200: "#A9C3D5",
          300: "#7EA5C0",
          400: "#4D7A9E",
          500: "#1B3A5C",
          600: "#163250",
          700: "#122943",
          800: "#0D1F33",
          900: "#091624",
        },
        crimson: {
          DEFAULT: "#D41B2C",
          50: "#FEF2F2",
          100: "#FDE3E3",
          200: "#FBC8C8",
          300: "#F7A0A0",
          400: "#F06868",
          500: "#D41B2C",
          600: "#B91626",
          700: "#9B1220",
          800: "#7D0E1A",
          900: "#5F0A14",
        },
        teal: {
          DEFAULT: "#0D7377",
          50: "#E6F5F5",
          100: "#CCEBEC",
          200: "#99D7D9",
          300: "#66C3C6",
          400: "#33AFB3",
          500: "#0D7377",
          600: "#0B6265",
          700: "#095153",
          800: "#073F41",
          900: "#042E2F",
        },
      },
      // Border / ring tokens map to the hairline vars (otherwise border-uq would
      // pick up colors.uq.DEFAULT = the light ink and draw a bright border).
      borderColor: {
        uq: "var(--uq-border)",
        "uq-strong": "var(--uq-border-strong)",
        "uq-faint": "var(--uq-border-faint)",
        "uq-accent": "var(--uq-accent)",
      },
      ringColor: {
        uq: "var(--uq-border-strong)",
        "uq-accent": "var(--uq-accent)",
      },
      boxShadow: {
        "uq-glass": "0 1px 0 0 rgba(180,210,255,0.06) inset, 0 12px 30px -12px rgba(0,0,0,0.65)",
        "uq-pop": "0 1px 0 0 rgba(180,210,255,0.06) inset, 0 24px 60px -18px rgba(0,0,0,0.80)",
        "uq-glow": "0 0 0 1px rgba(77,163,255,0.35), 0 0 18px -2px rgba(77,163,255,0.45)",
        "uq-glow-soft": "0 0 22px -6px rgba(77,163,255,0.40)",
        "uq-glow-cyan": "0 0 22px -6px rgba(95,227,216,0.35)",
      },
      backgroundImage: {
        "uq-aurora":
          "radial-gradient(60rem 40rem at 78% -8%, rgba(77,163,255,0.16), transparent 60%), radial-gradient(48rem 36rem at 8% 108%, rgba(95,227,216,0.10), transparent 55%)",
        "uq-grid":
          "linear-gradient(to right, rgba(148,178,224,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,178,224,0.05) 1px, transparent 1px)",
      },
      backgroundSize: {
        "uq-grid": "44px 44px",
      },
      keyframes: {
        "uq-rise": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "uq-pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(77,163,255,0.0)" },
          "50%": { boxShadow: "0 0 14px -2px rgba(77,163,255,0.55)" },
        },
      },
      animation: {
        "uq-rise": "uq-rise 240ms cubic-bezier(0.22,1,0.36,1) both",
        "uq-pulse-glow": "uq-pulse-glow 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
