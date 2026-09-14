// Shiki transformer: wraps each highlighted block in a panel with a copy
// button in the corner (enabled by a script in Layout.astro, hidden until then).
const el = (tagName, properties, children = []) => ({
  type: "element",
  tagName,
  properties,
  children,
})

export default {
  name: "code-block-panel",
  root(root) {
    root.children = [
      el("div", { class: "code-block" }, [
        el("button", {
          type: "button",
          class: "code-block-copy",
          ariaLabel: "Copy code",
          title: "Copy code",
          hidden: true,
        }),
        ...root.children,
      ]),
    ]
  },
}
