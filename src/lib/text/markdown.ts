import type { PmMark, PmNode } from "@/lib/docs/schema";

/**
 * Markdown <-> ProseMirror conversion.
 *
 * This is the lingua franca between the text surface and everything else:
 *  - the AI reads documents as markdown and writes edits as markdown
 *    (local models emit sane markdown; they do not emit sane ProseMirror JSON)
 *  - `.md` import/export uses it
 *  - deck and canvas recipes read source documents through it
 *
 * Scope is deliberately the subset TipTap's StarterKit can represent. Anything
 * unrecognised degrades to a paragraph rather than being dropped.
 */

/* ------------------------------------------------------------------ *
 * Inline
 * ------------------------------------------------------------------ */

interface InlineRule {
  re: RegExp;
  mark?: (m: RegExpExecArray) => PmMark;
  /** Which capture group holds the inner content. */
  group: number;
  /** Code spans take their content literally — no nested parsing. */
  literal?: boolean;
}

const INLINE_RULES: InlineRule[] = [
  { re: /`([^`]+)`/, group: 1, literal: true, mark: () => ({ type: "code" }) },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    group: 1,
    mark: (m) => ({ type: "link", attrs: { href: m[2] } }),
  },
  { re: /\*\*([^*]+)\*\*/, group: 1, mark: () => ({ type: "bold" }) },
  { re: /__([^_]+)__/, group: 1, mark: () => ({ type: "bold" }) },
  { re: /~~([^~]+)~~/, group: 1, mark: () => ({ type: "strike" }) },
  { re: /(?<![*\w])\*([^*\n]+)\*(?!\*)/, group: 1, mark: () => ({ type: "italic" }) },
  { re: /(?<![_\w])_([^_\n]+)_(?!_)/, group: 1, mark: () => ({ type: "italic" }) },
];

function textNode(text: string, marks: PmMark[]): PmNode {
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}

/** Parses inline markdown into ProseMirror text nodes carrying marks. */
export function parseInline(src: string, marks: PmMark[] = []): PmNode[] {
  if (!src) return [];

  let best: { rule: InlineRule; match: RegExpExecArray } | null = null;
  for (const rule of INLINE_RULES) {
    const match = rule.re.exec(src);
    if (!match) continue;
    if (!best || match.index < best.match.index) best = { rule, match };
  }

  if (!best) return [textNode(src, marks)];

  const { rule, match } = best;
  const out: PmNode[] = [];
  if (match.index > 0) out.push(...parseInline(src.slice(0, match.index), marks));

  const inner = match[rule.group];
  const nextMarks = rule.mark ? [...marks, rule.mark(match)] : marks;
  if (rule.literal) {
    if (inner) out.push(textNode(inner, nextMarks));
  } else {
    out.push(...parseInline(inner, nextMarks));
  }

  const rest = src.slice(match.index + match[0].length);
  if (rest) out.push(...parseInline(rest, marks));
  return out;
}

function paragraph(text: string): PmNode {
  const content = parseInline(text.trim());
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

/* ------------------------------------------------------------------ *
 * Blocks
 * ------------------------------------------------------------------ */

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const FENCE_RE = /^\s*```\s*(\S*)\s*$/;

interface ListItemLine {
  indent: number;
  text: string;
  ordered: boolean;
}

/** Builds a (possibly nested) list node from consecutive list lines. */
function buildList(items: ListItemLine[], start = 0, baseIndent = 0): { node: PmNode; next: number } {
  const ordered = items[start].ordered;
  const listItems: PmNode[] = [];
  let i = start;

  while (i < items.length && items[i].indent >= baseIndent) {
    if (items[i].indent > baseIndent) {
      // Deeper indent belongs to the previous item as a nested list.
      const nested = buildList(items, i, items[i].indent);
      const parent = listItems[listItems.length - 1];
      if (parent && parent.content) parent.content.push(nested.node);
      else listItems.push({ type: "listItem", content: [{ type: "paragraph" }, nested.node] });
      i = nested.next;
      continue;
    }
    if (items[i].ordered !== ordered) break;
    listItems.push({ type: "listItem", content: [paragraph(items[i].text)] });
    i++;
  }

  return {
    node: { type: ordered ? "orderedList" : "bulletList", content: listItems },
    next: i,
  };
}

/** Converts markdown source into an array of ProseMirror block nodes. */
export function markdownToBlocks(md: string): PmNode[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PmNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = FENCE_RE.exec(line);
    if (fence) {
      const language = fence[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      blocks.push({
        type: "codeBlock",
        attrs: { language },
        content: body.length ? [{ type: "text", text: body.join("\n") }] : undefined,
      });
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        attrs: { level: heading[1].length },
        content: parseInline(heading[2].trim()),
      });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(QUOTE_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ type: "blockquote", content: markdownToBlocks(quoted.join("\n")) });
      continue;
    }

    if (BULLET_RE.test(line) || ORDERED_RE.test(line)) {
      const items: ListItemLine[] = [];
      while (i < lines.length && (BULLET_RE.test(lines[i]) || ORDERED_RE.test(lines[i]))) {
        const om = ORDERED_RE.exec(lines[i]);
        const bm = BULLET_RE.exec(lines[i]);
        const m = (om ?? bm)!;
        items.push({ indent: Math.floor(m[1].length / 2), text: m[2], ordered: Boolean(om) });
        i++;
      }
      let cursor = 0;
      while (cursor < items.length) {
        const { node, next } = buildList(items, cursor, items[cursor].indent);
        blocks.push(node);
        cursor = next === cursor ? cursor + 1 : next;
      }
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !HEADING_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i]) &&
      !FENCE_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) blocks.push(paragraph(para.join(" ")));
  }

  return blocks;
}

/** Wraps `markdownToBlocks` in a complete `doc` node. */
export function markdownToDoc(md: string): PmNode {
  const content = markdownToBlocks(md);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/* ------------------------------------------------------------------ *
 * Serialisation
 * ------------------------------------------------------------------ */

function escapeInline(text: string): string {
  return text.replace(/([*_`~])/g, "\\$1");
}

function serializeInline(nodes: PmNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type !== "text" || !node.text) return "";
      let out = node.text;
      const marks = node.marks ?? [];
      const has = (t: string) => marks.some((m) => m.type === t);
      if (has("code")) return `\`${out}\``;
      out = escapeInline(out);
      if (has("bold")) out = `**${out}**`;
      if (has("italic")) out = `*${out}*`;
      if (has("strike")) out = `~~${out}~~`;
      const link = marks.find((m) => m.type === "link");
      if (link) out = `[${out}](${(link.attrs?.href as string) ?? ""})`;
      return out;
    })
    .join("");
}

function serializeBlock(node: PmNode, depth: number): string {
  const pad = "  ".repeat(depth);
  switch (node.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `${"#".repeat(level)} ${serializeInline(node.content)}`;
    }
    case "paragraph":
      return pad + serializeInline(node.content);
    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const body = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `\`\`\`${lang}\n${body}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "blockquote":
      return (node.content ?? [])
        .map((c) => serializeBlock(c, depth))
        .join("\n\n")
        .split("\n")
        .map((l) => `> ${l}`.trimEnd())
        .join("\n");
    case "bulletList":
    case "orderedList": {
      const ordered = node.type === "orderedList";
      return (node.content ?? [])
        .map((item, idx) => {
          const marker = ordered ? `${idx + 1}.` : "-";
          const parts = item.content ?? [];
          const [first, ...rest] = parts;
          const head = `${pad}${marker} ${first ? serializeInline(first.content) : ""}`;
          const tail = rest.map((r) => serializeBlock(r, depth + 1)).join("\n");
          return tail ? `${head}\n${tail}` : head;
        })
        .join("\n");
    }
    default:
      return node.content ? serializeInline(node.content) : "";
  }
}

/** Serialises a ProseMirror `doc` node (or block array) to markdown. */
export function docToMarkdown(doc: PmNode): string {
  const blocks = doc.type === "doc" ? (doc.content ?? []) : [doc];
  return blocks
    .map((b) => serializeBlock(b, 0))
    .filter((s) => s.length > 0)
    .join("\n\n")
    .trim();
}

/** Plain text with no markdown syntax — used for word counts and previews. */
export function docToPlainText(doc: PmNode): string {
  const parts: string[] = [];
  const walk = (node: PmNode) => {
    if (node.text) parts.push(node.text);
    if (node.type === "paragraph" || node.type === "heading") parts.push("\n");
    (node.content ?? []).forEach(walk);
  };
  walk(doc);
  return parts.join("").replace(/\n{2,}/g, "\n").trim();
}
