/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        discord: {
          sidebar: '#1e1f22',
          channels: '#2b2d31',
          chat: '#313338',
          userbar: '#232428',
          hover: '#35373c',
          active: '#404249',
          accent: '#5865F2',
          'accent-hover': '#4752C4',
          green: '#23a55a',
          yellow: '#f0b232',
          red: '#f23f43',
          text: '#dbdee1',
          muted: '#949ba4',
          header: '#f2f3f5'
        }
      }
    },
  },
  plugins: [],
}
