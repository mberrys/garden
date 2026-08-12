"use client";

import { Sprout } from "lucide-react";
import { DOC_KIND_LABELS } from "@/lib/docs/schema";
import { listPackets, packetSurfaces } from "@/lib/packets";
import { useWorkspace } from "@/lib/store/workspace";
import { Button, cx } from "./ui";
import { DocIcon } from "./doc-icon";

export function SeedPacketPicker() {
  const plantPacket = useWorkspace((s) => s.plantPacket);
  const startBlankWorkspace = useWorkspace((s) => s.startBlankWorkspace);
  const packets = listPackets();

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-10">
      <Sprout size={22} className="text-accent" aria-hidden />
      <h1 className="mt-3 text-base font-semibold text-ink">Plant a seed packet</h1>
      <p className="mt-1.5 max-w-md text-center text-xs leading-relaxed text-muted">
        A packet sprouts starter documents, opens the right panes, and tunes the
        assistant for a craft. Nothing is applied until you pick one.
      </p>

      <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
        {packets.map((packet) => {
          const surfaces = packetSurfaces(packet);
          return (
            <button
              key={packet.id}
              type="button"
              aria-label={`Plant ${packet.label}`}
              onClick={() => void plantPacket(packet.id)}
              className={cx(
                "flex flex-col gap-2 rounded-lg border border-line bg-raised px-3.5 py-3 text-left",
                "transition-colors hover:border-accent hover:bg-hover",
              )}
            >
              <div className="text-sm font-medium text-ink">{packet.label}</div>
              <div className="text-[11px] leading-relaxed text-muted">{packet.blurb}</div>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                {surfaces.map((kind) => (
                  <span
                    key={kind}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-bg px-1.5 py-0.5 text-[10px] text-muted"
                  >
                    <DocIcon kind={kind} size={10} />
                    {DOC_KIND_LABELS[kind]}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-5"
        onClick={() => void startBlankWorkspace()}
      >
        Start with a blank workspace
      </Button>
    </div>
  );
}
