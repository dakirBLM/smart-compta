import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Black & white theme. "brand" is the primary dark surface/text color.
        brand: {
          DEFAULT: "#111111", // near-black
          dark: "#000000",
        },
        clientbg: "#F5F5F5",
        success: "#16A34A",
        danger: "#DC2626",
        warning: "#D97706",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
