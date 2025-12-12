// postcss.config.mjs
/** @type {import('postcss-load-config').Config} */
const config = {
  // Desactiva los source maps de PostCSS
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
