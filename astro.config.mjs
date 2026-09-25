import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

import vercel from "@astrojs/vercel";

export default defineConfig({
  devToolbar: {
    enabled: false,
  },
  vite: {
    css: {
      transformer: "postcss",
    },
    // adapter: vercel(),
  },

  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
});
