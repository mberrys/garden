import { describe, expect, it } from "vitest";
import { docToMarkdown, docToPlainText, markdownToBlocks, markdownToDoc, parseInline } from "./markdown";

describe("inline parsing", () => {
  it("applies bold, italic, strike and code marks", () => {
    const nodes = parseInline("plain **bold** and *italic* and ~~gone~~ and `code`");
    const marked = (type: string) =>
      nodes.find((n) => n.marks?.some((m) => m.type === type))?.text;
    expect(marked("bold")).toBe("bold");
    expect(marked("italic")).toBe("italic");
    expect(marked("strike")).toBe("gone");
    expect(marked("code")).toBe("code");
  });

  it("does not parse markdown inside a code span", () => {
    const nodes = parseInline("`**not bold**`");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("**not bold**");
    expect(nodes[0].marks).toEqual([{ type: "code" }]);
  });

  it("parses links with an href attribute", () => {
    const nodes = parseInline("see [the docs](https://example.com/x)");
    const link = nodes.find((n) => n.marks?.some((m) => m.type === "link"));
    expect(link?.text).toBe("the docs");
    expect(link?.marks?.[0].attrs).toEqual({ href: "https://example.com/x" });
  });

  it("leaves intra-word underscores alone", () => {
    const nodes = parseInline("some_variable_name");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].marks).toBeUndefined();
  });
});

describe("block parsing", () => {
  it("parses headings at each level", () => {
    const blocks = markdownToBlocks("# One\n\n### Three");
    expect(blocks[0]).toMatchObject({ type: "heading", attrs: { level: 1 } });
    expect(blocks[1]).toMatchObject({ type: "heading", attrs: { level: 3 } });
  });

  it("parses bullet and ordered lists", () => {
    const blocks = markdownToBlocks("- a\n- b\n\n1. first\n2. second");
    expect(blocks[0].type).toBe("bulletList");
    expect(blocks[0].content).toHaveLength(2);
    expect(blocks[1].type).toBe("orderedList");
  });

  it("nests indented list items under their parent", () => {
    const blocks = markdownToBlocks("- outer\n  - inner");
    expect(blocks[0].type).toBe("bulletList");
    const firstItem = blocks[0].content![0];
    expect(firstItem.content!.some((c) => c.type === "bulletList")).toBe(true);
  });

  it("parses fenced code blocks without interpreting their contents", () => {
    const blocks = markdownToBlocks("```ts\nconst a = **1**;\n# not a heading\n```");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: "codeBlock", attrs: { language: "ts" } });
    expect(blocks[0].content![0].text).toBe("const a = **1**;\n# not a heading");
  });

  it("parses blockquotes and horizontal rules", () => {
    const blocks = markdownToBlocks("> quoted\n> more\n\n---");
    expect(blocks[0].type).toBe("blockquote");
    expect(blocks[1].type).toBe("horizontalRule");
  });

  it("joins wrapped lines into a single paragraph", () => {
    const blocks = markdownToBlocks("one line\ncontinued here\n\nseparate");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content![0].text).toBe("one line continued here");
  });

  it("always produces at least one block for an empty document", () => {
    expect(markdownToDoc("").content).toEqual([{ type: "paragraph" }]);
  });
});

describe("markdown round-trip", () => {
  const sources = [
    "# Title\n\nA paragraph with **bold** and *italic* text.",
    "## Findings\n\n- first\n- second\n- third",
    "1. one\n2. two",
    "> a quotation\n\nfollowed by text",
    "```js\nconst x = 1;\n```",
    "Text with a [link](https://example.com) inline.",
  ];

  for (const src of sources) {
    it(`preserves: ${src.split("\n")[0]}`, () => {
      const once = docToMarkdown(markdownToDoc(src));
      const twice = docToMarkdown(markdownToDoc(once));
      // Serialising a parse of a serialisation must be a fixed point, which is
      // what matters when the AI reads a document and writes an edit back.
      expect(twice).toBe(once);
      expect(once).toContain(src.split("\n")[0].replace(/[#>-]/g, "").trim().split(" ")[0]);
    });
  }

  it("strips syntax for plain-text extraction", () => {
    const text = docToPlainText(markdownToDoc("# Title\n\nSome **bold** words."));
    expect(text).toContain("Title");
    expect(text).toContain("bold");
    expect(text).not.toContain("**");
    expect(text).not.toContain("#");
  });
});
