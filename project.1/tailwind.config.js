/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Quicksand', 'sans-serif'],
      },
      colors: {
        moja: {
          blue: '#355574',
          orange: '#e66d38',
          aqua: '#6dccc2',
          yellow: '#efd35c',
          pink: '#df76b6',
          bg: '#f9f9f9',
        },
      },
    },
  },
  plugins: [],
};
