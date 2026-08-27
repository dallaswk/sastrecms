/**
 * Vite picks this up on its own, which is all @astrojs/tailwind was doing. Keeping the
 * pipeline explicit here means Tailwind 3 and daisyUI 4 stay exactly as they were: this
 * is a packaging change, not a Tailwind upgrade.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
