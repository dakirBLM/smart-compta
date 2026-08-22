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
        // Comptia DZ Brand Palette
        brand: {
          DEFAULT: "#1F3D35", // Deep forest green
          dark: "#142823",    // Darker green
          light: "#2A5247",   // Medium forest green
          subtle: "#EBF3EE",  // Very pale green tint
        },
        lime: {
          DEFAULT: "#C8F15A", // Electric lime green accent
          hover: "#B8E348",   // Darker lime on hover
          light: "#E8FFC5",   // Pale lime background / badge
          soft: "rgba(200, 241, 90, 0.15)",
        },
        accent: {
          DEFAULT: "#C8F15A",
          hover: "#B8E348",
          light: "#E8FFC5",
        },
        canvas: "#F7FAF7",
        clientbg: "#F4F7F4",
        success: {
          DEFAULT: "#16A34A",
          light: "#DCFCE7",
        },
        danger: {
          DEFAULT: "#DC2626",
          light: "#FEE2E2",
        },
        warning: {
          DEFAULT: "#D97706",
          light: "#FEF3C7",
        },
        info: {
          DEFAULT: "#0284C7",
          light: "#E0F2FE",
        },
      },
      fontFamily: {
        sans: ["Poppins", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 4px 20px -4px rgba(31, 61, 53, 0.07)",
        "card-hover": "0 10px 30px -5px rgba(31, 61, 53, 0.12)",
        glow: "0 0 25px rgba(200, 241, 90, 0.35)",
        "glow-sm": "0 0 12px rgba(200, 241, 90, 0.25)",
        "brand-glow": "0 10px 30px -5px rgba(31, 61, 53, 0.35)",
      },
      borderRadius: {
        "2xl": "16px",
        "3xl": "24px",
        "4xl": "32px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-spin": "radar 8s linear infinite",
        float: "float 4s ease-in-out infinite",
        shimmer: "shimmer 2s infinite linear",
      },
      keyframes: {
        radar: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;

