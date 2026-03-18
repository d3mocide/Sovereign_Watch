// Tailwind CSS 4.x is handled by the @tailwindcss/vite plugin in vite.config.ts.
// PostCSS only needs autoprefixer for vendor-prefix injection.
export default {
  plugins: {
    autoprefixer: {},
  },
}
