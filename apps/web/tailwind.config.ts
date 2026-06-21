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
        background: "#0f172a",
        foreground: "#f8fafc",
        border: "#334155",
        muted: "#cbd5e1",
        panel: "#1e293b",
        gold: "#facc15",
        positive: "#22c55e",
        warning: "#f97316",
        caution: "#ef4444",
        unreliable: "#94a3b8"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(2, 6, 23, 0.34)"
      }
    }
  },
  plugins: []
};

export default config;
