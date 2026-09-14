// Shiki transformer: wraps each highlighted block in a panel with a small
// header showing the language and a copy button (enabled by a script in
// Layout.astro, hidden until then).
const LANGUAGE_NAMES = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  hs: "Haskell",
  haskell: "Haskell",
  sh: "Shell",
  bash: "Shell",
  json: "JSON",
  plaintext: "Text",
}

const el = (tagName, properties, children = []) => ({
  type: "element",
  tagName,
  properties,
  children,
})

export default {
  name: "code-block-panel",
  root(root) {
    const lang = this.options.lang
    const label = LANGUAGE_NAMES[lang] ?? lang
    root.children = [
      el("div", { class: "code-block" }, [
        el("div", { class: "code-block-head" }, [
          el("span", { class: "code-block-lang" }, [
            { type: "text", value: label },
          ]),
          el(
            "button",
            { type: "button", class: "code-block-copy", hidden: true },
            [{ type: "text", value: "Copy" }],
          ),
        ]),
        ...root.children,
      ]),
    ]
  },
}
