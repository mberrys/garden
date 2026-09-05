"use client";

import { useState } from "react";
import { Sprout } from "lucide-react";
import { DOC_KIND_LABELS } from "@/lib/docs/schema";
import {
  listPackets,
  packetArtifactCount,
  packetAvailability,
  packetNeedsPreview,
  packetSurfaces,
  type SeedPacket,
} from "@/lib/packets";
import { useWorkspace } from "@/lib/store/workspace";
import { Button, cx } from "./ui";
import { DocIcon } from "./doc-icon";

export function SeedPacketPicker() {
  const plantPacket = useWorkspace((s) => s.plantPacket);
  const startBlankWorkspace = useWorkspace((s) => s.startBlankWorkspace);
  const packets = listPackets();
  const [previewPacket, setPreviewPacket] = useState<SeedPacket | null>(null);

  const handlePlant = (packet: SeedPacket) => {
    if (packetNeedsPreview(packet)) {
      setPreviewPacket(packet);
      return;
    }
    void plantPacket(packet.id);
  };

  if (previewPacket) {
    return (
      <PacketPreview
        packet={previewPacket}
        onCancel={() => setPreviewPacket(null)}
        onPlant={() => {
          void plantPacket(previewPacket.id);
          setPreviewPacket(null);
        }}
      />
    );
  }

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
          const availability = packetAvailability(packet);
          return (
            <button
              key={packet.id}
              type="button"
              aria-label={`Plant ${packet.label}`}
              disabled={!availability.available}
              onClick={() => handlePlant(packet)}
              className={cx(
                "flex flex-col gap-2 rounded-lg border border-line bg-raised px-3.5 py-3 text-left",
                availability.available
                  ? "transition-colors hover:border-accent hover:bg-hover"
                  : "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-ink">{packet.label}</div>
                <span className="text-[10px] text-faint">v{packet.version}</span>
              </div>
              <div className="text-[11px] leading-relaxed text-muted">{packet.blurb}</div>
              {!availability.available && availability.reason && (
                <div className="text-[10px] text-danger">{availability.reason}</div>
              )}
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

export function PacketPreview({
  packet,
  onCancel,
  onPlant,
}: {
  packet: SeedPacket;
  onCancel: () => void;
  onPlant: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-10">
      <h1 className="text-base font-semibold text-ink">Preview — {packet.label}</h1>
      <p className="mt-1.5 max-w-lg text-center text-xs leading-relaxed text-muted">
        {packet.blurb}
      </p>
      <p className="mt-1 text-[10px] text-faint">
        Packet {packet.id} · v{packet.version} · {packetArtifactCount(packet)} artifacts
      </p>

      <div className="mt-6 w-full max-w-lg space-y-4 text-xs">
        <section>
          <h2 className="font-medium text-ink">Documents & decks</h2>
          <ul className="mt-1.5 space-y-1 text-muted">
            {packet.starterArtifacts.map((a) => (
              <li key={a.localId}>
                <DocIcon kind={a.kind} size={12} className="mr-1 inline" />
                {a.title} <span className="text-faint">({DOC_KIND_LABELS[a.kind]})</span>
              </li>
            ))}
          </ul>
        </section>

        {packet.starterBases?.length ? (
          <section>
            <h2 className="font-medium text-ink">Database bases</h2>
            <ul className="mt-1.5 space-y-2 text-muted">
              {packet.starterBases.map((base) => (
                <li key={base.localId}>
                  <div className="font-medium text-ink">{base.title}</div>
                  <div className="text-[10px] text-faint">
                    {base.fields.length} fields · {(base.rows ?? []).length} sample rows ·{" "}
                    {base.views.map((v) => v.name).join(", ")}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {packet.links?.length ? (
          <section>
            <h2 className="font-medium text-ink">Initial links</h2>
            <ul className="mt-1.5 space-y-1 text-muted">
              {packet.links.map((link, i) => (
                <li key={i}>
                  {link.kind === "relation"
                    ? `Relation on ${link.rowLocalId} → ${link.targetRowLocalIds.join(", ")}`
                    : `Garden ref on ${link.rowLocalId} → ${link.targetLocalId}`}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h2 className="font-medium text-ink">Layout</h2>
          <ul className="mt-1.5 space-y-1 text-muted">
            {packet.layout.open.map((open) => (
              <li key={open.localId}>
                Pane {open.pane + 1}: {open.localId}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="default" onClick={onCancel}>Back</Button>
        <Button variant="primary" onClick={onPlant}>Plant packet</Button>
      </div>
    </div>
  );
}
