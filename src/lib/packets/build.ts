import type { TextDoc } from "@/lib/docs/schema";
import { createTextDoc } from "@/lib/docs/factories";
import { markdownToDoc } from "@/lib/text/markdown";

/** Text documents in packets are authored as markdown strings. */
export function textFromMarkdown(title: string, markdown: string): TextDoc {
  const doc = createTextDoc(title);
  return { ...doc, body: markdownToDoc(markdown) };
}
