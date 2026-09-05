"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaDoc } from "@/lib/docs/schema";
import { newAssetId } from "@/lib/docs/ids";
import { loadBlob, storeBlob, useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { resolveGardenRef } from "@/lib/refs";
import { Button, cx } from "@/components/ui";

/** Loads a stored blob once its id is known and renders an object URL. */
function StoredImage({ blobId, name }: { blobId: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    void loadBlob(blobId).then((blob) => {
      if (!active || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId]);

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center bg-sunken text-[11px] text-muted">
        Loading…
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="h-full w-full object-cover" />;
}

export default function MediaSurface({
  doc,
}: {
  doc: MediaDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);
  const docs = useWorkspace((s) => s.docs);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = doc.body.assets.find((a) => a.id === selectedId) ?? null;

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  const select = useCallback(
    (assetId: string | null) => {
      setSelectedId(assetId);
      setSelection(doc.id, assetId ? { kind: "media", assetId } : null);
    },
    [doc.id, setSelection],
  );

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const blobId = await storeBlob(file, file.name, file.type);
      commit(
        doc.id,
        [
          {
            op: "addAsset",
            asset: {
              id: newAssetId(),
              blobId,
              name: file.name,
              mime: file.type || "application/octet-stream",
              caption: "",
              tags: [],
            },
          },
        ],
        { label: "Add media" },
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[11px] text-faint">{doc.body.assets.length} assets</span>
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          Add images
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void addFiles(e.target.files)}
        />
        <div className="ml-auto flex gap-1">
          {(["board", "list"] as const).map((layout) => (
            <button
              key={layout}
              type="button"
              onClick={() => commit(doc.id, [{ op: "setLayout", layout }], { label: "Layout" })}
              className={cx(
                "rounded-md px-2 py-1 text-[11px]",
                doc.body.layout === layout ? "bg-accent text-accent-fg" : "text-muted hover:bg-hover",
              )}
            >
              {layout}
            </button>
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-3">
          {doc.body.assets.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted">
              Drop images or click Add images. Captions stay Garden-owned.
            </div>
          ) : (
            <div
              className={
                doc.body.layout === "list"
                  ? "flex flex-col gap-2"
                  : "grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3"
              }
            >
              {doc.body.assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => select(asset.id)}
                  className={cx(
                    "overflow-hidden rounded-lg border bg-raised text-left",
                    selectedId === asset.id ? "border-accent" : "border-line hover:border-accent/50",
                  )}
                >
                  <div className="flex h-28 items-center justify-center bg-sunken text-[11px] text-faint">
                    {asset.blobId ? (
                      <StoredImage blobId={asset.blobId} name={asset.name} />
                    ) : (
                      asset.name || "No file"
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="truncate text-[12px] text-ink">{asset.caption || asset.name || "Untitled"}</div>
                    {asset.tags.length > 0 && (
                      <div className="truncate text-[10px] text-faint">{asset.tags.join(" · ")}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <aside className="w-64 shrink-0 overflow-y-auto border-l border-line bg-raised p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold">Asset</div>
              <button type="button" className="text-[10px] text-muted" onClick={() => select(null)}>
                Close
              </button>
            </div>
            <label className="mb-2 flex flex-col gap-1 text-[10px] text-muted">
              Caption
              <input
                className="rounded border border-line bg-bg px-1 py-0.5 text-xs text-ink"
                value={selected.caption}
                onChange={(e) =>
                  commit(doc.id, [{ op: "setCaption", id: selected.id, caption: e.target.value }], {
                    coalesceKey: `media-cap:${selected.id}`,
                    label: "Caption",
                  })
                }
              />
            </label>
            <label className="mb-2 flex flex-col gap-1 text-[10px] text-muted">
              Tags (comma separated)
              <input
                className="rounded border border-line bg-bg px-1 py-0.5 text-xs text-ink"
                value={selected.tags.join(", ")}
                onChange={(e) =>
                  commit(
                    doc.id,
                    [
                      {
                        op: "setTags",
                        id: selected.id,
                        tags: e.target.value
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      },
                    ],
                    { coalesceKey: `media-tags:${selected.id}`, label: "Tags" },
                  )
                }
              />
            </label>
            <div className="text-[10px] text-muted">
              Links:{" "}
              {selected.links.length === 0
                ? "—"
                : selected.links
                    .map((ref) => resolveGardenRef(ref, docs).label)
                    .join("; ")}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
