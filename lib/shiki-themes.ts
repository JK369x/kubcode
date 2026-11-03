// Code colours drawn from the kubcode palette (DESIGN.md), one theme per
// colour scheme. Shiki emits both as CSS variables; globals.css picks one
// from html[data-theme].
type Theme = {
  name: string;
  type: "dark" | "light";
  colors: Record<string, string>;
  tokenColors: Array<{ scope: string[]; settings: { foreground?: string; fontStyle?: string } }>;
};

function theme(name: string, type: "dark" | "light", c: Record<string, string>): Theme {
  return {
    name,
    type,
    colors: { "editor.background": c.bg, "editor.foreground": c.ink },
    tokenColors: [
      { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.comment, fontStyle: "italic" } },
      { scope: ["string", "string.quoted", "markup.inline.raw"], settings: { foreground: c.string } },
      { scope: ["keyword", "storage", "storage.type", "keyword.control"], settings: { foreground: c.keyword } },
      { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: c.fn } },
      { scope: ["constant.numeric", "constant.language", "support.constant"], settings: { foreground: c.number } },
      { scope: ["variable.parameter", "variable.other.readwrite", "entity.name.tag"], settings: { foreground: c.ink } },
      { scope: ["entity.other.attribute-name", "support.type.property-name"], settings: { foreground: c.attr } },
      { scope: ["punctuation", "meta.brace"], settings: { foreground: c.muted } },
    ],
  };
}

export const KUBCODE_DARK = theme("kubcode-dark", "dark", {
  bg: "#1b1722",
  ink: "#f5f1fb",
  muted: "#b8adca",
  comment: "#a397b6",
  string: "#d1b9ff",
  keyword: "#bb98ff",
  fn: "#f0c9ff",
  number: "#ffb8d9",
  attr: "#c9b6e8",
});

export const KUBCODE_LIGHT = theme("kubcode-light", "light", {
  bg: "#ffffff",
  ink: "#271c34",
  muted: "#6c5f7d",
  comment: "#6c5f7d",
  string: "#5b2a99",
  keyword: "#7136b9",
  fn: "#8a2e7a",
  number: "#a3245c",
  attr: "#4f3a6e",
});
