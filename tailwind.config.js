/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f4ecd8",
        "paper-dk": "#e8dcc0",
        ink: "#1a1614",
        stamp: "#b91c1c",
        gain: "#1f6b3a",
        loss: "#b91c1c",
      },
      fontFamily: {
        display: ["'Playfair Display'", "serif"],
        serif: ["'EB Garamond'", "serif"],
        mono: ["'DM Mono'", "ui-monospace", "monospace"],
        stamp: ["'Special Elite'", "'Courier New'", "monospace"],
      },
    },
  },
  plugins: [],
};
