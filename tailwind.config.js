/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
