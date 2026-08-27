import type { Doc } from "@/lib/docs/schema";
import type { Pane } from "./workspace";

export type StorageKind = "dexie" | "folder";

export interface WorkspacePayload {
  docs: Doc[];
  order: string[];
  panes: [Pane, Pane];
  splitView: boolean;
  seedPacketId: string | null;
  seedPacketVersion: number | null;
  flavorId: string | null;
}

export interface StorageBackend {
  kind: StorageKind;
  read(): Promise<WorkspacePayload | null>;
  write(payload: WorkspacePayload): Promise<void>;
  writeBlob?(id: string, blob: Blob, name: string, mime: string): Promise<void>;
}

let primary: StorageKind = "dexie";

export function getPrimaryStorage(): StorageKind {
  return primary;
}

export function setPrimaryStorage(kind: StorageKind): void {
  primary = kind;
}

export function folderManifest(payload: WorkspacePayload): Record<string, unknown> {
  return {
    format: "garden-worktree",
    version: 1,
    order: payload.order,
    panes: payload.panes,
    splitView: payload.splitView,
    seedPacketId: payload.seedPacketId,
    seedPacketVersion: payload.seedPacketVersion,
    flavorId: payload.flavorId,
  };
}
