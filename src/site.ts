import { getCollection, type CollectionEntry } from "astro:content"

export const SITE = {
  title: "Abstract fun",
  description:
    "Collection of posts about fun abstract things, may include some non-sense",
  author: "Yassine EL Ouafi",
  twitter: "YassineElouafi2",
}

export type Post = CollectionEntry<"blog">

/** All posts, newest first. */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection("blog")
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
}

export const postUrl = (post: Post) => `/${post.id}/`

/** e.g. "September 5, 2023". */
export const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

/**
 * Use an en dash for spaced hyphens in titles ("part 1 - continuations"),
 * glued to the preceding word so it never starts a line.
 */
export const displayTitle = (title: string) =>
  title.replaceAll(" - ", " – ")

/** Plain-text excerpt of a post body, cut at a word boundary. */
export function excerpt(post: Post, length = 140): string {
  const text = (post.body ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (text.length <= length) return text
  const cut = text.slice(0, length)
  return cut.slice(0, cut.lastIndexOf(" ")) + "…"
}
