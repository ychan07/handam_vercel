/** @type {import('tailwindcss').Config} */
module.exports = {
  // Legacy .list-item is an application component, not a display utility.
  blocklist: ["list-item"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ...Object.fromEntries(["background", "foreground", "border", "input", "ring"].map(name => [name, "hsl(var(--admin-" + name + ") / <alpha-value> )"])),
        ...Object.fromEntries(["card", "popover", "primary", "secondary", "muted", "accent", "destructive"].map(name => [name, { DEFAULT: "hsl(var(--admin-" + name + ") / <alpha-value>)", foreground: "hsl(var(--admin-" + name + "-foreground) / <alpha-value>)" }])),
        toss: {
          blue: "#3182f6",
          gray: {
            100: "#f2f4f6",
            200: "#e5e8eb",
            300: "#d1d6db",
            400: "#adb5bd",
            500: "#8b95a1",
            600: "#4e5968",
            700: "#333d4b",
            800: "#191f28",
          }
        }
      },
      borderRadius: {
        "3xl": "24px",
      }
    },
  },
  plugins: [],
};
