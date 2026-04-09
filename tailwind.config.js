/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        etoro: '#2EA543',
        xtb: '#E4002B',
        ibkr: '#FF6600',
        btc: '#F7931A',
        gain: '#16a34a',
        loss: '#dc2626',
        belar: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#2EA543',
          600: '#16a34a',
          900: '#14532d'
        }
      },
      fontFamily: {
        mono: ['SF Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}
