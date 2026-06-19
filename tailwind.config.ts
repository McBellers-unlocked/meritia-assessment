import type { Config } from "tailwindcss";

// UNIQAssess palettes.
//
// "Calm Light" (the `uq.*` group below) is the app-wide light design system
// (Linear/Vercel/Stripe feel). Every token is a CSS variable defined on :root
// in globals.css, so these utilities are a single source of truth and resolve
// light everywhere. Depth comes from the soft elevation shadow scale
// (uq-e1/e2/e3), not hard borders; one indigo accent carries interaction.
//
// The legacy navy/crimson/teal palettes are unused by the app now; prune in a
// follow-up.
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
        // Soft, large-radius, low-opacity elevation — depth without hard borders.
        "uq-glass": "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -8px rgba(16,24,40,0.12)",
        "uq-pop": "0 4px 12px rgba(16,24,40,0.08), 0 24px 48px -12px rgba(16,24,40,0.18)",
        "uq-glow": "0 0 0 1px rgba(79,70,229,0.22), 0 8px 20px -6px rgba(79,70,229,0.30)",
        "uq-glow-soft": "0 1px 2px rgba(16,24,40,0.06), 0 10px 24px -12px rgba(79,70,229,0.28)",
        "uq-glow-cyan": "0 10px 24px -12px rgba(14,116,144,0.22)",
        "uq-e1": "0 1px 2px rgba(16,24,40,0.05), 0 1px 3px rgba(16,24,40,0.04)",
        "uq-e2": "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px -8px rgba(16,24,40,0.12)",
        "uq-e3": "0 4px 12px rgba(16,24,40,0.08), 0 24px 48px -12px rgba(16,24,40,0.18)",
      },
      backgroundImage: {
        "uq-aurora":
          "radial-gradient(55rem 42rem at 90% -12%, rgba(79,70,229,0.06), transparent 60%), radial-gradient(40rem 32rem at 2% 112%, rgba(14,116,144,0.035), transparent 55%)",
        "uq-grid":
          "linear-gradient(to right, rgba(16,24,40,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,24,40,0.04) 1px, transparent 1px)",
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
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(79,70,229,0.0)" },
          "50%": { boxShadow: "0 0 12px -2px rgba(79,70,229,0.45)" },
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
