import { defineConfig } from "astro/config";

import react from "@astrojs/react";

import tailwindcss from "@tailwindcss/vite";

import vercel from "@astrojs/vercel";
// import node from "@astrojs/node"; // or your platform's adapter

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

  // output: "hybrid", // or 'server'
  adapter: vercel({
    // change back to vercel
    webAnalytics: {
      enabled: true,
      // mode: "standalone",
    },
  }),
});
