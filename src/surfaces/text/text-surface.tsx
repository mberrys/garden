"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { closeHistory } from "@tiptap/pm/history";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import type { PmNode, TextDoc } from "@/lib/docs/schema";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { docToPlainText } from "@/lib/text/markdown";
import { isSafeHref } from "@/lib/text/safe-href";
import { Divider, IconButton, ToolbarGroup } from "@/components/ui";
import { configureTransparentLink } from "./transparent-link";
import { redoOnModX } from "./redo-on-mod-x";

/**
 * Rich text surface.
 *
 * TipTap owns the undo stack here (see SURFACE_OWNS_HISTORY in the store): its
 * history plugin already tracks edits at character granularity, which a
 * block-level op stack cannot match. AI edits are pushed into the editor as a
 * single transaction so they undo as one step alongside the user's own typing.
 */
export default function TextSurface({
  doc,
  paneIndex: _paneIndex,
}: {
  doc: TextDoc;
  paneIndex: PaneIndex;
}) {
  const replaceDoc = useWorkspace((s) => s.replaceDoc);
  const setSelection = useWorkspace((s) => s.setSelection);

  /**
   * Guards the two-way sync. `applyingRemote` suppresses the change handler
   * while we push store content in; `lastPushed` lets us tell our own echo from
   * a genuine external change (an accepted AI suggestion).
   */
  const applyingRemote = useRef(false);
  const lastPushed = useRef<string>("");
  const [hoveredHref, setHoveredHref] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: useMemo(
      () => [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: false,
        }),
        configureTransparentLink(),
        redoOnModX(),
        Placeholder.configure({ placeholder: "Start writing, or ask the assistant for a draft…" }),
      ],
      [],
    ),
    content: doc.body,
    editorProps: {
      attributes: {
        class: "rr-prose min-h-full outline-none",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (applyingRemote.current) return;
      const body = instance.getJSON() as PmNode;
      lastPushed.current = JSON.stringify(body);
      replaceDoc({ ...doc, body, updatedAt: Date.now() });
    },
    onSelectionUpdate: ({ editor: instance }) => {
      publishSelection(instance, doc.id, setSelection);
    },
  });

  // Pull in changes that did not originate here — an accepted AI suggestion, or
  // an undo triggered from another view of the same document.
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(doc.body);
    if (incoming === lastPushed.current) return;
    if (incoming === JSON.stringify(editor.getJSON())) return;

    applyingRemote.current = true;
    // `closeHistory` is what makes ctrl+Z behave. ProseMirror groups adjacent
    // transactions that land within ~500ms into a single undo step, so an AI
    // edit accepted shortly after the user stopped typing would merge with that
    // typing — and one ctrl+Z would wipe both. Closing the group first
    // guarantees the AI edit is exactly one undo step of its own.
    //
    // `emitUpdate: false` keeps this out of onUpdate; the transaction still
    // lands on the history stack, so the edit remains undoable.
    editor
      .chain()
      .command(({ tr }) => {
        closeHistory(tr);
        return true;
      })
      .setContent(doc.body, { emitUpdate: false })
      .run();
    lastPushed.current = incoming;
    applyingRemote.current = false;
  }, [doc.body, editor]);

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;

    const onMove = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        setHoveredHref(null);
        return;
      }
      const anchor = target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement && root.contains(anchor)) {
        setHoveredHref(anchor.href);
        return;
      }
      setHoveredHref(null);
    };

    const onLeave = () => setHoveredHref(null);

    root.addEventListener("mousemove", onMove);
    root.addEventListener("mouseleave", onLeave);
    return () => {
      root.removeEventListener("mousemove", onMove);
      root.removeEventListener("mouseleave", onLeave);
    };
  }, [editor]);

  if (!editor) {
    return <div className="flex h-full items-center justify-center text-xs text-faint">Loading…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <FixedToolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
        <div className="mx-auto w-full max-w-[46rem] px-8 py-10">
          <EditorContent editor={editor} />
        </div>
      </div>
      <StatusBar editor={editor} doc={doc} hoveredHref={hoveredHref} />

      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        className="flex items-center gap-0.5 rounded-lg border border-line bg-raised p-1 shadow-[var(--shadow-md)]"
      >
        <MarkButton editor={editor} mark="bold" label="Bold" icon={<Bold size={14} />} />
        <MarkButton editor={editor} mark="italic" label="Italic" icon={<Italic size={14} />} />
        <MarkButton editor={editor} mark="strike" label="Strikethrough" icon={<Strikethrough size={14} />} />
        <MarkButton editor={editor} mark="code" label="Code" icon={<Code size={14} />} />
        <Divider vertical />
        <IconButton
          label="Link"
          size="sm"
          active={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const href = window.prompt("Link URL");
            if (href && isSafeHref(href)) editor.chain().focus().setLink({ href }).run();
          }}
        >
          <Link2 size={14} />
        </IconButton>
      </BubbleMenu>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

function FixedToolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line bg-raised px-3 py-1.5">
      <ToolbarGroup>
        {([1, 2, 3] as const).map((level) => {
          const Icon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
          return (
            <IconButton
              key={level}
              label={`Heading ${level}`}
              size="sm"
              active={editor.isActive("heading", { level })}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            >
              <Icon size={14} />
            </IconButton>
          );
        })}
      </ToolbarGroup>

      <ToolbarGroup>
        <MarkButton editor={editor} mark="bold" label="Bold" icon={<Bold size={14} />} />
        <MarkButton editor={editor} mark="italic" label="Italic" icon={<Italic size={14} />} />
        <MarkButton editor={editor} mark="strike" label="Strikethrough" icon={<Strikethrough size={14} />} />
        <MarkButton editor={editor} mark="code" label="Inline code" icon={<Code size={14} />} />
      </ToolbarGroup>

      <ToolbarGroup>
        <IconButton
          label="Bullet list"
          size="sm"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </IconButton>
        <IconButton
          label="Numbered list"
          size="sm"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </IconButton>
        <IconButton
          label="Quote"
          size="sm"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </IconButton>
        <IconButton
          label="Code block"
          size="sm"
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <Code size={14} />
        </IconButton>
      </ToolbarGroup>
    </div>
  );
}

function MarkButton({
  editor,
  mark,
  label,
  icon,
}: {
  editor: Editor;
  mark: string;
  label: string;
  icon: React.ReactNode;
}) {
  const toggle = useCallback(() => {
    const chain = editor.chain().focus();
    switch (mark) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "strike":
        chain.toggleStrike().run();
        break;
      case "code":
        chain.toggleCode().run();
        break;
    }
  }, [editor, mark]);

  return (
    <IconButton label={label} size="sm" active={editor.isActive(mark)} onClick={toggle}>
      {icon}
    </IconButton>
  );
}

function StatusBar({
  editor,
  doc,
  hoveredHref,
}: {
  editor: Editor;
  doc: TextDoc;
  hoveredHref: string | null;
}) {
  const words = useMemo(() => {
    const text = docToPlainText(doc.body);
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
  }, [doc.body]);

  const blocks = doc.body.content?.length ?? 0;
  const selection = editor.state.selection;
  const selected = selection.empty
    ? 0
    : editor.state.doc.textBetween(selection.from, selection.to, " ").split(/\s+/).filter(Boolean)
        .length;

  return (
    <div className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-raised px-3 text-[11px] text-faint">
      <span>{words.toLocaleString()} words</span>
      <span>{blocks} blocks</span>
      {selected > 0 && <span className="text-accent">{selected} selected</span>}
      {hoveredHref && (
        <span className="ml-auto min-w-0 truncate text-muted" title={hoveredHref}>
          {hoveredHref}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Selection
 * ------------------------------------------------------------------ */

/**
 * Publishes the selection as *block indices*, because that is how text ops
 * address content — the assistant is told "the user selected block 3" and can
 * act on it directly.
 */
function publishSelection(
  editor: Editor,
  docId: string,
  setSelection: ReturnType<typeof useWorkspace.getState>["setSelection"],
) {
  const { from, to, empty } = editor.state.selection;

  if (empty) {
    const index = blockIndexAt(editor, from);
    setSelection(docId, { kind: "text", blockIndex: index, blockCount: 0, text: "" });
    return;
  }

  const startIndex = blockIndexAt(editor, from);
  const endIndex = blockIndexAt(editor, to);
  setSelection(docId, {
    kind: "text",
    blockIndex: startIndex,
    blockCount: Math.max(1, endIndex - startIndex + 1),
    text: editor.state.doc.textBetween(from, to, "\n\n"),
  });
}

/** Index of the top-level block containing a document position. */
function blockIndexAt(editor: Editor, pos: number): number {
  const resolved = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
  // depth 1 is the top-level block; index(0) is its position among siblings.
  return resolved.depth === 0 ? Math.max(0, resolved.index(0) - 1) : resolved.index(0);
}
