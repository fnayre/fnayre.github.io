import rss from "@astrojs/rss"
import type { APIContext, ImageMetadata } from "astro"
import {
  SITE,
  displayTitle,
  excerpt,
  getPosts,
  postUrl,
  type Post,
} from "../site"

const images = import.meta.glob<ImageMetadata>(
  "/content/blog/**/*.{png,jpg,jpeg,gif,webp,svg}",
  { eager: true, import: "default" }
)

// `rendered.html` leaves local Markdown images as `__ASTRO_IMAGE_`
// placeholders (they are resolved at page render time). Swap them for plain
// <img> tags pointing at the built asset so feed readers can show them.
function feedHtml(post: Post, site: URL) {
  const html = post.rendered?.html
  if (!html || !post.filePath) return html
  const dir = new URL(post.filePath, "file:///")
  return html.replace(/<img __ASTRO_IMAGE_="([^"]*)"\s*\/?>/g, (tag, attr) => {
    const { src, alt } = JSON.parse(attr.replaceAll("&quot;", '"'))
    const image = images[new URL(src, dir).pathname]
    if (!image) return tag
    const url = new URL(image.src, site)
    return `<img src="${url}" alt="${alt ?? ""}" width="${image.width}" height="${image.height}">`
  })
}

export async function GET(context: APIContext) {
  const site = context.site!
  const posts = await getPosts()
  return rss({
    title: SITE.title,
    description: SITE.description,
    site,
    items: posts.map((post) => ({
      title: displayTitle(post.data.title),
      pubDate: post.data.date,
      description: post.data.description ?? excerpt(post),
      link: postUrl(post),
      content: feedHtml(post, site),
    })),
  })
}
