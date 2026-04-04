import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["var(--font-noto-sans-mono)", "ui-monospace", "monospace"]
      },
      colors: {
        ink: "#F5F3FF",
        violetDark: "#0D081B"
      },
      boxShadow: {
        glow: "0 0 80px rgba(139,92,246,0.35)"
      },
      backgroundImage: {
        "hero-radial":
          "radial-gradient(80rem 45rem at 50% -10%, rgba(139,92,246,0.45) 0%, rgba(20,10,40,0.95) 55%, rgba(7,5,15,1) 100%)"
      }
    }
  },
  plugins: []
};

export default config;
