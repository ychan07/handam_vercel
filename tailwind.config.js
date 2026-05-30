/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
