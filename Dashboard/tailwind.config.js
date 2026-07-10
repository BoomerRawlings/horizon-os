/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        horizon: {
          bg: "#07111d",
          elevated: "#0d1928",
          panel: "#101d2d",
          soft: "#132235",
          line: "rgba(148, 163, 184, 0.16)",
          active: "rgba(56, 189, 248, 0.55)",
          accent: "#38bdf8",
        },
      },
      boxShadow: {
        panel: "0 16px 40px rgba(0, 0, 0, 0.22)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
