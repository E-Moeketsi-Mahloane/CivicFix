/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        panel: '0 24px 80px -30px rgba(15, 23, 42, 0.9)',
      },
    },
  },
  plugins: [],
}

