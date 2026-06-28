/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Liquid Glass semantic accents (see design_handoff_liquid_glass).
        accent: "#0a84ff",
        income: "#34e0c4",
        expense: "#ff6b8a",
        balance: "#64d2ff",
        "lg-teal": "#30d5c8",
        "lg-indigo": "#5e5ce6",
        "lg-violet": "#bf5af2",
      },
      borderRadius: {
        glass: "20px",
        panel: "22px",
        tile: "16px",
      },
      fontFamily: {
        // SF Pro system stack for the Apple "Liquid Glass" look.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
