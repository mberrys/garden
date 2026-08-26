"use client";

import { useMemo, useRef, useState } from "react";
import {
  Columns2,
  Copy,
  Download,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Sprout,
  Trash2,
  Upload,
} from "lucide-react";
import { DOC_KIND_LABELS, type Doc } from "@/lib/docs/schema";
import { listPackets } from "@/lib/packets";
import { snapshotOf, useWorkspace } from "@/lib/store/workspace";
import {
  BUNDLE_EXTENSION,
  downloadBlob,
  exportBundle,
  importFile,
  timestampedName,
} from "@/lib/store/bundle";
import { allSurfaces } from "@/lib/surfaces/registry";
import { Button, IconButton, InlineEdit, Menu, MenuItem, MenuLabel, cx } from "./ui";
import { DocIcon } from "./doc-icon";
import { folderPickerSupported, pickFolder, writeWorktree } from "@/lib/store/folder";
import { WindowChromeStrip } from "./window-chrome";

const NEW_DOC_OPTIONS = allSurfaces().map((s) => ({
  kind: s.kind,
  label: s.label,
}));

export function Sidebar() {
  const docs = useWorkspace((s) => s.docs);
  const order = useWorkspace((s) => s.order);
  const panes = useWorkspace((s) => s.panes);
  const activePane = useWorkspace((s) => s.activePane);
  const newDoc = useWorkspace((s) => s.newDoc);
  const plantPacket = useWorkspace((s) => s.plantPacket);
  const requestPacketPicker = useWorkspace((s) => s.requestPacketPicker);
  const seedSuppressed = useWorkspace((s) => s.seedSuppressed);
  const openDoc = useWorkspace((s) => s.openDoc);
  const removeDoc = useWorkspace((s) => s.removeDoc);
  const renameDoc = useWorkspace((s) => s.renameDoc);
  const duplicateDoc = useWorkspace((s) => s.duplicateDoc);
  const reorderDoc = useWorkspace((s) => s.reorderDoc);
  const toast = useWorkspace((s) => s.toast);

  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const activeDocId = panes[activePane].activeDocId;
  const openIds = useMemo(
    () => new Set([...panes[0].docIds, ...panes[1].docIds]),
    [panes],
  );

  const listed = useMemo(() => {
    const items = order.map((id) => docs[id]).filter((d): d is Doc => Boolean(d));
    const q = query.trim().toLowerCase();
    return q ? items.filter((d) => d.title.toLowerCase().includes(q)) : items;
  }, [order, docs, query]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      try {
        await importFile(file);
      } catch (err) {
        toast("error", err instanceof Error ? err.message : String(err));
      }
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportBundle();
      downloadBlob(blob, timestampedName("garden workspace", BUNDLE_EXTENSION));
      toast("success", "Workspace exported.");
    } catch (err) {
      toast("error", `Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await pickFolder();
      toast("success", "Folder worktree is the primary store for this session.");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveFolder = async () => {
    try {
      const snap = snapshotOf(useWorkspace.getState());
      await writeWorktree({
        docs: snap.order.map((id) => snap.docs[id]).filter((doc): doc is Doc => Boolean(doc)),
        order: snap.order,
        panes: snap.panes,
        splitView: snap.splitView,
        seedPacketId: snap.seedPacketId,
        seedPacketVersion: snap.seedPacketVersion,
        flavorId: snap.flavorId,
      });
      toast("success", "Saved garden.json to the open folder.");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-line bg-sunken">
      <WindowChromeStrip className="flex items-center gap-1 px-2.5 pt-2.5">
        <div className="flex-1 select-none text-sm font-semibold tracking-tight text-ink">
          garden
          <span className="ml-1.5 font-normal text-faint">workspace</span>
        </div>
        <Menu
          align="end"
          trigger={({ toggle }) => (
            <IconButton label="New document" size="sm" onClick={toggle}>
              <Plus size={15} />
            </IconButton>
          )}
        >
          <MenuLabel>New</MenuLabel>
          {NEW_DOC_OPTIONS.map(({ kind, label }) => (
            <MenuItem
              key={kind}
              icon={<DocIcon kind={kind} size={14} />}
              onClick={() => newDoc(kind, `Untitled ${label.toLowerCase()}`)}
            >
              {label}
            </MenuItem>
          ))}
          <MenuLabel>Seed packets</MenuLabel>
          {listPackets().map((packet) => (
            <MenuItem
              key={packet.id}
              icon={<Sprout size={14} />}
              onClick={() => void plantPacket(packet.id)}
            >
              {packet.label}
            </MenuItem>
          ))}
        </Menu>
      </WindowChromeStrip>

      <div className="relative px-2.5 py-2">
        <Search size={13} className="absolute left-4.5 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search documents"
          className="h-7 w-full rounded-md border border-line bg-bg pl-7 pr-2 text-xs text-ink placeholder:text-faint focus:border-accent"
        />
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            void handleFiles(e.dataTransfer.files);
          }
        }}
      >
        {listed.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs leading-relaxed text-faint">
            {query ? (
              "No matches."
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span>No documents yet. Plant a seed packet, create one, or drop a PDF here.</span>
                {!seedSuppressed && (
                  <Button size="sm" variant="ghost" onClick={requestPacketPicker}>
                    <Sprout size={13} />
                    Plant a seed packet
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          listed.map((doc, index) => {
            const isDropTarget = dropIndex === index && dragId !== doc.id;
            return (
              <div
                key={doc.id}
                draggable={renaming !== doc.id}
                onDragStart={(e) => {
                  setDragId(doc.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  setDropIndex(index);
                }}
                onDrop={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  reorderDoc(dragId, order.indexOf(doc.id));
                  setDragId(null);
                  setDropIndex(null);
                }}
                className={cx(
                  "group relative flex items-center gap-2 rounded-md px-2 py-1.5",
                  isDropTarget && "before:absolute before:inset-x-1 before:-top-px before:h-0.5 before:rounded before:bg-accent",
                  activeDocId === doc.id
                    ? "bg-active text-ink"
                    : "text-muted hover:bg-hover hover:text-ink",
                  dragId === doc.id && "opacity-40",
                )}
              >
                <DocIcon kind={doc.kind} />
                {renaming === doc.id ? (
                  <InlineEdit
                    value={doc.title}
                    onCommit={(next) => {
                      renameDoc(doc.id, next);
                      setRenaming(null);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => openDoc(doc.id)}
                    onDoubleClick={() => setRenaming(doc.id)}
                    className="min-w-0 flex-1 truncate text-left text-[13px]"
                    title={doc.title}
                  >
                    {doc.title}
                  </button>
                )}
                {openIds.has(doc.id) && renaming !== doc.id && (
                  <span
                    aria-label="Open"
                    title="Open"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                )}
                <Menu
                  align="end"
                  trigger={({ toggle, open }) => (
                    <IconButton
                      label={`Actions for ${doc.title}`}
                      size="sm"
                      onClick={toggle}
                      className={cx(
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                        open && "opacity-100",
                      )}
                    >
                      <MoreHorizontal size={14} />
                    </IconButton>
                  )}
                >
                  <MenuLabel>{DOC_KIND_LABELS[doc.kind]}</MenuLabel>
                  <MenuItem onClick={() => setRenaming(doc.id)}>Rename</MenuItem>
                  <MenuItem icon={<Copy size={14} />} onClick={() => duplicateDoc(doc.id)}>
                    Duplicate
                  </MenuItem>
                  <MenuItem
                    icon={<Columns2 size={14} />}
                    onClick={() => openDoc(doc.id, 1)}
                  >
                    Open in split
                  </MenuItem>
                  <MenuItem
                    icon={<Download size={14} />}
                    onClick={async () => {
                      const blob = await exportBundle([doc.id]);
                      downloadBlob(blob, timestampedName(doc.title, BUNDLE_EXTENSION));
                    }}
                  >
                    Export
                  </MenuItem>
                  <MenuItem
                    danger
                    icon={<Trash2 size={14} />}
                    onClick={() => void removeDoc(doc.id)}
                  >
                    Delete
                  </MenuItem>
                </Menu>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={`.pdf,.md,.markdown,.txt,.json,.docx,.odt,.pptx,.odp,.xlsx,.ods,${BUNDLE_EXTENSION}`}
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
          <Upload size={13} />
          Import
        </Button>
        <Button size="sm" variant="ghost" onClick={handleExport} disabled={order.length === 0}>
          <Download size={13} />
          Export
        </Button>
        {folderPickerSupported() && (
          <>
            <Button size="sm" variant="ghost" onClick={() => void handleOpenFolder()}>
              <FolderOpen size={13} />
              Open folder
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void handleSaveFolder()}>
              Save folder
            </Button>
          </>
        )}
      </div>
    </aside>
  );
}
