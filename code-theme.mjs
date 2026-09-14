// Shiki theme in the spirit of LaTeX `listings`: mostly ink, bold keywords,
// types in blue, comments in italics. No background; the stylesheet frames
// code blocks with rules instead.
const ink = "#161b26"
const muted = "#5e6675"
const type = "#1f4e8c"

export default {
  name: "proof-sheet",
  type: "light",
  colors: {
    "editor.background": "#00000000",
    "editor.foreground": ink,
  },
  tokenColors: [
    { settings: { foreground: ink } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: muted, fontStyle: "italic" },
    },
    {
      scope: [
        "keyword",
        "storage",
        "variable.language",
        "constant.language",
      ],
      settings: { foreground: ink, fontStyle: "bold" },
    },
    {
      scope: ["keyword.operator", "punctuation"],
      settings: { foreground: ink, fontStyle: "" },
    },
    {
      scope: ["keyword.operator.new", "keyword.operator.expression"],
      settings: { foreground: ink, fontStyle: "bold" },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.other.inherited-class",
        "support.type",
        "support.class",
        "storage.type.haskell",
        "constant.other.haskell",
      ],
      settings: { foreground: type, fontStyle: "" },
    },
  ],
}
