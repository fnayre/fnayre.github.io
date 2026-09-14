import { defineCollection } from "astro:content"
import { glob } from "astro/loaders"
import { z } from "astro/zod"

const blog = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./content/blog",
    // Keep Gatsby's file-path based URLs, e.g.
    // `2021-06-26-algebraic-effects-trees/2021-06-26-algebraic-effects-trees`.
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    categories: z.string().optional(),
    aiAssisted: z.boolean().default(false),
  }),
})

export const collections = { blog }
