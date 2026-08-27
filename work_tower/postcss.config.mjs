// v4.0.1 — string-based plugin (سازگار با webpack build که روی Vercel استفاده می‌شود)
// نکته: Turbopack build به‌دلیل مشکل lightningcss روی Tailwind v4 کار نمی‌کند، پس روی Vercel از webpack استفاده می‌کنیم.
const config = {
  plugins: ["@tailwindcss/postcss"],
};

export default config;
