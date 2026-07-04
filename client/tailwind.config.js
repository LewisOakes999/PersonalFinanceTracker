/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Liquid Glass semantic accents — the entire chromatic palette.
        // One brand accent + three status colours; nothing else gets a hue.
        accent: "#0a84ff", // brand blue: primary actions, focus, neutral progress
        balance: "#64d2ff", // readable tint of accent: links, chart lines on dark
        income: "#34e0c4", // positive money movement
        expense: "#ff6b8a", // negative money movement / over budget
        warn: "#ffd60a", // approaching a limit
      },
      backgroundImage: {
        // The single sanctioned gradient, reserved for the brand tile.
        brand: "linear-gradient(140deg, #0a84ff, #30d5c8)",
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
