// @ts-check
import { defineConfig } from "astro/config"
import sitemap from "@astrojs/sitemap"
import codeTheme from "./code-theme.mjs"
import codeBlocks from "./code-blocks.mjs"

export default defineConfig({
  site: "https://fnayre.github.io",
  // Pages are built as `/post/index.html` (served at `/post/`, like Gatsby).
  // "ignore" lets `/post` resolve in dev too; GitHub Pages redirects it.
  trailingSlash: "ignore",
  integrations: [sitemap()],
  markdown: {
    shikiConfig: { theme: codeTheme, transformers: [codeBlocks] },
  },
})
