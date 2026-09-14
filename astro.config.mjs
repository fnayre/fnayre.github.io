// @ts-check
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"

export default defineConfig({
  site: "https://fnayre.github.io",
  // Gatsby served every page at a trailing-slash URL; keep the same shape.
  trailingSlash: "always",
  integrations: [sitemap()],
  markdown: {
    // Closest Shiki match to the old Prism "VS" theme.
    shikiConfig: { theme: "light-plus" },
  },
})
