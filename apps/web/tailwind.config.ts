import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#0b1220",
        foreground: "#f8fafc",
        border: "#2a3648",
        muted: "#aab6c8",
        panel: "#162033",
        gold: "#d9b159",
        positive: "#4ade80",
        warning: "#f59e0b",
        caution: "#ef4444",
        unreliable: "#94a3b8"
      },
      boxShadow: {
        panel: "0 22px 55px rgba(2, 6, 23, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
