import type { Config } from "tailwindcss";

// UNIQAssess uses a professional navy palette. The hex values are the same
// generic navy used throughout the candidate UI — they are not a Callater
// brand mark. Two legacy palettes (crimson, teal) are kept for now in case
// the admin UI grows toward them; prune in a follow-up once unused.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
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
    },
  },
  plugins: [],
};
export default config;
