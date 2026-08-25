"use client";

import { useWorkspace } from "@/lib/store/workspace";
import { Button } from "./ui";

export function PlanPreviewBanner() {
  const pending = useWorkspace((s) => s.pendingPlan);
  const acceptPlan = useWorkspace((s) => s.acceptPlan);
  const dismissPlan = useWorkspace((s) => s.dismissPlan);
  if (!pending) return null;

  const { preview } = pending;
  return (
    <div className="pointer-events-auto fixed bottom-4 left-1/2 z-40 w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-line bg-raised p-3 shadow-lg">
      <div className="mb-1 text-xs font-semibold text-ink">{preview.label}</div>
      <ul className="mb-2 max-h-40 overflow-auto text-[11px] text-muted">
        {preview.creates.map((item) => (
          <li key={`c-${item.title}`}>Create {item.kind}: {item.title}</li>
        ))}
        {preview.deletes.map((item) => (
          <li key={`d-${item.id}`}>Delete {item.title}</li>
        ))}
        {preview.updates.map((item) => (
          <li key={`u-${item.id}`}>Edit {item.title} ({item.opCount} ops)</li>
        ))}
        {preview.layout && <li>Change pane layout</li>}
        {preview.packetBinding?.packetId && <li>Bind packet {preview.packetBinding.packetId}</li>}
      </ul>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => dismissPlan()}>
          Discard
        </Button>
        <Button size="sm" variant="primary" onClick={() => acceptPlan()}>
          Apply transaction
        </Button>
      </div>
    </div>
  );
}
