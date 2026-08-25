import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";

/**
 * ProseMirror schema whose JSON matches Garden `PmNode` names: `bold`/`italic`
 * rather than `strong`/`em`, `bulletList`/`orderedList`/`listItem`, etc.
 * Engine documents round-trip through this schema; Garden remains canonical.
 */
const nodes: Record<string, NodeSpec> = {
  doc: { content: "block+" },
  paragraph: {
    content: "inline*",
    group: "block",
    parseDOM: [{ tag: "p" }],
    toDOM() {
      return ["p", 0];
    },
  },
  heading: {
    content: "inline*",
    group: "block",
    defining: true,
    attrs: { level: { default: 1 } },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
    toDOM(node) {
      return [`h${node.attrs.level as number}`, 0];
    },
  },
  blockquote: {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{ tag: "blockquote" }],
    toDOM() {
      return ["blockquote", 0];
    },
  },
  codeBlock: {
    content: "text*",
    group: "block",
    code: true,
    defining: true,
    marks: "",
    attrs: { language: { default: null } },
    parseDOM: [
      {
        tag: "pre",
        preserveWhitespace: "full",
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          const code = el.querySelector("code");
          const cls = code?.className ?? "";
          const match = /language-(\S+)/.exec(cls);
          return { language: match?.[1] ?? null };
        },
      },
    ],
    toDOM(node) {
      const language = node.attrs.language as string | null;
      return ["pre", ["code", language ? { class: `language-${language}` } : {}, 0]];
    },
  },
  horizontalRule: {
    group: "block",
    parseDOM: [{ tag: "hr" }],
    toDOM() {
      return ["hr"];
    },
  },
  bulletList: {
    content: "listItem+",
    group: "block",
    parseDOM: [{ tag: "ul" }],
    toDOM() {
      return ["ul", 0];
    },
  },
  orderedList: {
    content: "listItem+",
    group: "block",
    parseDOM: [{ tag: "ol" }],
    toDOM() {
      return ["ol", 0];
    },
  },
  listItem: {
    content: "block+",
    defining: true,
    parseDOM: [{ tag: "li" }],
    toDOM() {
      return ["li", 0];
    },
  },
  text: { group: "inline" },
  hardBreak: {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{ tag: "br" }],
    toDOM() {
      return ["br"];
    },
  },
};

const marks: Record<string, MarkSpec> = {
  bold: {
    parseDOM: [
      { tag: "strong" },
      { tag: "b" },
      { style: "font-weight=bold" },
      { style: "font-weight=700" },
    ],
    toDOM() {
      return ["strong", 0];
    },
  },
  italic: {
    parseDOM: [{ tag: "em" }, { tag: "i" }, { style: "font-style=italic" }],
    toDOM() {
      return ["em", 0];
    },
  },
  strike: {
    parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }, { style: "text-decoration=line-through" }],
    toDOM() {
      return ["s", 0];
    },
  },
  code: {
    parseDOM: [{ tag: "code" }],
    toDOM() {
      return ["code", 0];
    },
  },
  link: {
    attrs: { href: { default: "" } },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom) => ({ href: (dom as HTMLElement).getAttribute("href") ?? "" }),
      },
    ],
    toDOM(mark) {
      return ["a", { href: mark.attrs.href as string, class: "garden-link" }, 0];
    },
  },
};

export const gardenSchema = new Schema({ nodes, marks });
