import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-noto-sans-mono)", "ui-monospace", "monospace"]
      },
      colors: {
        page: "#FDFDFC",
        cream: {
          DEFAULT: "#FAF8F4",
          dark: "#F3F0E8",
          deep: "#E8E4DB"
        },
        ink: "#111111",
        muted: "#5C5C5C",
        faint: "#8A8A8A",
        line: "#E0DDD6"
      },
      boxShadow: {
        glow: "0 0 80px rgba(17,17,17,0.06)",
        card: "0 8px 32px rgba(17,17,17,0.06)"
      },
      backgroundImage: {
        "hero-radial":
          "radial-gradient(80rem 45rem at 50% -10%, rgba(253,253,252,0.95) 0%, rgba(250,248,244,0.98) 55%, rgba(243,240,232,1) 100%)"
      }
    }
  },
  plugins: []
};

export default config;
