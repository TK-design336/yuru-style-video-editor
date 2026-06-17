import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        glass: {
          DEFAULT: "rgba(18, 18, 22, 0.72)",
          raised: "rgba(26, 26, 32, 0.78)",
          muted: "rgba(14, 14, 18, 0.55)",
          deep: "rgba(8, 8, 12, 0.85)",
          veil: "rgba(10, 10, 14, 0.62)",
          border: "rgba(255, 255, 255, 0.12)",
          "border-strong": "rgba(255, 255, 255, 0.18)",
        },
        accent: {
          DEFAULT: "#FF6B35",
          soft: "#FFB088",
          muted: "#FF8C5A",
          glow: "rgba(255, 107, 53, 0.35)",
        },
        /* legacy aliases — prefer glass-* and accent-* */
        surface: {
          DEFAULT: "rgba(18, 18, 22, 0.72)",
          raised: "rgba(26, 26, 32, 0.78)",
          muted: "rgba(14, 14, 18, 0.55)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Noto Sans JP",
          "Hiragino Sans",
          "Yu Gothic UI",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "SF Mono",
          "Consolas",
          "ui-monospace",
          "monospace",
        ],
      },
      borderRadius: {
        glass: "14px",
        "glass-lg": "18px",
        "glass-xl": "20px",
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0, 0, 0, 0.35)",
        "glass-sm": "0 4px 16px rgba(0, 0, 0, 0.25)",
        "accent-glow": "0 0 20px rgba(255, 107, 53, 0.35)",
        "accent-glow-sm": "0 0 12px rgba(255, 107, 53, 0.25)",
      },
      backdropBlur: {
        glass: "24px",
        "glass-lg": "32px",
      },
    },
  },
  plugins: [],
} satisfies Config;
