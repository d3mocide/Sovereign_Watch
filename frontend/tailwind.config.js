/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "tactical-bg": "#050505",
        "tactical-panel": "#121212",
        "tactical-border": "#1e1e1e",
        "hud-green": "#00ff41",
        "air-cyan": "#00ffff",
        "sea-green": "#00ff64",
        "alert-red": "#ff3333",
        "alert-amber": "#ffb000",
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', "monospace"],
        sans: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "mono-xs": ["0.65rem", { lineHeight: "1rem", letterSpacing: "0.05em" }],
        "mono-sm": ["0.75rem", { lineHeight: "1.1rem" }],
        "mono-base": ["0.875rem", { lineHeight: "1.25rem" }],
        "mono-lg": ["1rem", { lineHeight: "1.5rem" }],
        "mono-xl": ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.02em" }],
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(to right, #1e1e1e 1px, transparent 1px), linear-gradient(to bottom, #1e1e1e 1px, transparent 1px)",
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        }
      },
      animation: {
        shimmer: 'shimmer 8s infinite',
      },
    },
  },
  plugins: [],
};
