/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        riverblue: {
          50:  '#e6f1fb',
          100: '#b5d4f4',
          200: '#85b7eb',
          400: '#378add',
          600: '#185fa5',
          800: '#0c447c',
          900: '#042c53',
        }
      }
    },
  },
  plugins: [],
}
