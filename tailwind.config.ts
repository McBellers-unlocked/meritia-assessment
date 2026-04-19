import type { Config } from "tailwindcss";

// Meritia uses a professional navy palette. The hex values are the same
// generic navy used throughout the candidate UI — they are not a Callater
// brand mark.
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
      },
    },
  },
  plugins: [],
};
export default config;
