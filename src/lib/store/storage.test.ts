import { describe, expect, it } from "vitest";
import { folderManifest, getPrimaryStorage, setPrimaryStorage } from "./storage";

describe("storage backends", () => {
  it("defaults to Dexie and can switch a session to folder as primary", () => {
    const previous = getPrimaryStorage();
    expect(previous).toBe("dexie");
    setPrimaryStorage("folder");
    expect(getPrimaryStorage()).toBe("folder");
    setPrimaryStorage("dexie");
  });

  it("serializes a folder manifest without engine objects", () => {
    const manifest = folderManifest({
      docs: [],
      order: ["doc_a"],
      panes: [
        { docIds: ["doc_a"], activeDocId: "doc_a" },
        { docIds: [], activeDocId: null },
      ],
      splitView: false,
      seedPacketId: "garden/welcome",
      seedPacketVersion: 1,
      flavorId: "data",
    });
    expect(manifest.format).toBe("garden-worktree");
    expect(JSON.stringify(manifest)).not.toContain("prosemirror");
  });
});
