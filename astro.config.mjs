// @ts-check
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import codeTheme from "./code-theme.mjs"
import codeBlocks from "./code-blocks.mjs"

export default defineConfig({
  site: "https://fnayre.github.io",
  // Gatsby served every page at a trailing-slash URL; keep the same shape.
  trailingSlash: "always",
  integrations: [sitemap()],
  markdown: {
    shikiConfig: { theme: codeTheme, transformers: [codeBlocks] },
  },
})
