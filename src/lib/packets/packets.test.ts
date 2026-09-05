import { describe, expect, it } from "vitest";
import "@/lib/surfaces";
import { RECIPES, recipesFor } from "@/lib/ai/recipes";
import { systemPrompt } from "@/lib/ai/prompt";
import { DocSchema } from "@/lib/docs/schema";
import { createTextDoc } from "@/lib/docs/factories";
import { workspaceShowsPacketPicker } from "@/lib/store/workspace";
import { getPacket, listPackets, PACKETS } from "./registry";
import { sproutPacket } from "./sprout";
import { packetAvailability, parseSeedPacket } from "./types";
import { welcomePacket } from "./welcome";

describe("seed packets", () => {
  it("registers unique ids", () => {
    const ids = PACKETS.map((packet) => packet.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "garden/welcome",
      "garden/history-seminar",
      "garden/grant-shop",
      "garden/field-notes",
      "data/experiment-report",
      "legal/matter",
      "comms/campaign",
    ]);
  });

  it("exposes every packet through the registry", () => {
    for (const packet of listPackets()) {
      expect(getPacket(packet.id)).toBe(packet);
    }
    expect(getPacket("garden/nope")).toBeUndefined();
  });

  it("sprouts schema-valid documents and resolves open localIds", () => {
    for (const packet of PACKETS) {
      const result = sproutPacket(packet);
      expect(result.docs).toHaveLength(
        packet.starterArtifacts.length + (packet.starterBases?.length ?? 0),
      );
      expect(result.order).toEqual(result.docs.map((doc) => doc.id));

      for (const doc of result.docs) {
        const parsed = DocSchema.safeParse(doc);
        expect(parsed.success, `${packet.id} ${doc.title}: ${parsed.error?.message}`).toBe(true);
      }

      const titles = new Set(result.docs.map((doc) => doc.title));
      for (const spec of packet.starterArtifacts) {
        expect(titles.has(spec.title), `${packet.id} missing "${spec.title}"`).toBe(true);
      }
      for (const base of packet.starterBases ?? []) {
        expect(titles.has(base.title), `${packet.id} missing base "${base.title}"`).toBe(true);
      }

      expect(result.panes[0].docIds.length).toBeGreaterThan(0);
      expect(result.panes[0].activeDocId).toBe(result.panes[0].docIds[0]);
      if (packet.layout.splitView) expect(result.splitView).toBe(true);
    }
  });

  it("keeps the welcome packet's starter titles", () => {
    const result = sproutPacket(welcomePacket);
    expect(result.docs.map((doc) => doc.title)).toEqual([
      "Welcome to garden",
      "How an edit flows",
      "A generative document workplace",
    ]);
    expect(result.splitView).toBe(true);
    expect(result.panes[1].docIds).toHaveLength(1);
  });

  it("comms/campaign seeds a calendar view on the pitch schedule", () => {
    const packet = getPacket("comms/campaign");
    expect(packet).toBeDefined();
    const pitchesSeed = packet!.starterBases?.find((base) => base.localId === "pitches");
    expect(pitchesSeed?.views.some((view) => view.type === "calendar")).toBe(true);

    const result = sproutPacket(packet!);
    const pitches = result.docs.find((d) => d.title === "Pitch Interactions");
    expect(pitches?.kind).toBe("database");
    if (pitches?.kind !== "database") return;
    const calendar = pitches.body.views.find((view) => view.type === "calendar");
    expect(calendar).toMatchObject({ type: "calendar", dateFieldId: "fld_date", name: "Schedule" });
    expect(pitches.body.activeViewId).toBe(calendar?.id);
  });

  it("comms/campaign resolves relation links across bases", () => {
    const packet = getPacket("comms/campaign");
    expect(packet).toBeDefined();
    const result = sproutPacket(packet!);
    const pitches = result.docs.find((d) => d.title === "Pitch Interactions");
    expect(pitches?.kind).toBe("database");
    if (pitches?.kind !== "database") return;

    const pitchRow = pitches.body.rows.find((r) => r.cells.fld_notes?.toString().includes("Nina"));
    expect(pitchRow).toBeDefined();
    const storyLinks = pitchRow?.cells.fld_story as string[] | undefined;
    const contactLinks = pitchRow?.cells.fld_pitch_contact as string[] | undefined;
    expect(storyLinks?.length).toBeGreaterThan(0);
    expect(contactLinks?.length).toBeGreaterThan(0);
  });

  it("allows a relation between any two bases regardless of declaration order", () => {
    // Base B is declared after base A, and A's relation targets B. Sprouting
    // must allocate every base id up front so the forward reference resolves
    // instead of throwing an unresolved-target error.
    const packet = {
      id: "test/forward-ref",
      version: 1,
      label: "Forward ref",
      blurb: "Relation targets a later base.",
      starterArtifacts: [
        {
          localId: "note",
          kind: "text" as const,
          title: "Note",
          build: () => createTextDoc("Note"),
        },
      ],
      starterBases: [
        {
          localId: "base_a",
          title: "Base A",
          fields: [
            { id: "fld_name", name: "Name", type: "text" },
            { id: "fld_b", name: "Ties to B", type: "relation", targetLocalId: "base_b" },
          ],
          views: [{ id: "vw", name: "Grid", type: "grid" }],
        },
        {
          localId: "base_b",
          title: "Base B",
          fields: [{ id: "fld_name", name: "Name", type: "text" }],
          views: [{ id: "vw", name: "Grid", type: "grid" }],
        },
      ],
      layout: { open: [{ localId: "note", pane: 0 }], splitView: false },
    };

    const result = sproutPacket(packet as unknown as Parameters<typeof sproutPacket>[0]);
    const baseA = result.docs.find((d) => d.title === "Base A");
    expect(baseA?.kind).toBe("database");
    if (baseA?.kind !== "database") return;
    const targetField = baseA.body.fields.find((f) => f.id === "fld_b");
    expect(targetField?.type).toBe("relation");
    const baseB = result.docs.find((d) => d.title === "Base B");
    if (targetField?.type === "relation" && baseB) {
      expect(targetField.targetDocId).toBe(baseB.id);
    }
  });

  it("requires packet version", () => {
    expect(() =>
      parseSeedPacket({
        ...welcomePacket,
        version: undefined,
      }),
    ).toThrow();
  });

  it("keeps packet recipe ids unique against the global list", () => {
    const global = new Set(RECIPES.map((recipe) => recipe.id));
    const seen = new Set<string>();
    for (const packet of PACKETS) {
      for (const recipe of packet.recipes ?? []) {
        expect(global.has(recipe.id), `${recipe.id} collides with a global recipe`).toBe(false);
        expect(seen.has(recipe.id), `${recipe.id} is used by two packets`).toBe(false);
        seen.add(recipe.id);
      }
    }
  });

  it("only features recipes that exist globally or on the packet", () => {
    for (const packet of PACKETS) {
      const known = new Set([
        ...RECIPES.map((recipe) => recipe.id),
        ...(packet.recipes ?? []).map((recipe) => recipe.id),
      ]);
      for (const id of packet.featuredRecipeIds ?? []) {
        expect(known.has(id), `${packet.id} features unknown recipe ${id}`).toBe(true);
      }
    }
  });

  it("rejects a packet that opens a document it does not have", () => {
    expect(() =>
      parseSeedPacket({
        ...welcomePacket,
        layout: { open: [{ localId: "missing", pane: 0 }] },
      }),
    ).toThrow(/missing/);
  });

  it("rejects a packet with no pane-0 document", () => {
    expect(() =>
      parseSeedPacket({
        ...welcomePacket,
        layout: { open: [{ localId: "welcome", pane: 1 }] },
      }),
    ).toThrow(/pane 0/);
  });

  it("marks the campaign packet available once database is registered", () => {
    const packet = getPacket("comms/campaign");
    expect(packet).toBeDefined();
    expect(packetAvailability(packet!)).toEqual({ available: true });
  });
});

describe("recipesFor with a planted packet", () => {
  it("prepends featured packet recipes for that surface", () => {
    const recipes = recipesFor("text", "garden/history-seminar");
    expect(recipes[0]?.id).toBe("notes-to-discussion");
    expect(recipes.some((recipe) => recipe.id === "doc-to-deck")).toBe(true);
    expect(recipes.some((recipe) => recipe.id === "text-tighten")).toBe(true);
  });

  it("does not leak another packet's recipes", () => {
    const recipes = recipesFor("text", "garden/welcome");
    expect(recipes.some((recipe) => recipe.id === "notes-to-discussion")).toBe(false);
  });
});

describe("systemPrompt addenda", () => {
  it("appends workspace craft notes when a packet supplies them", () => {
    const packet = getPacket("garden/grant-shop");
    const addenda = packet?.assistantPromptAddenda?.join("\n");
    const prompt = systemPrompt("text", addenda);
    expect(prompt).toContain("## Workspace craft");
    expect(prompt).toContain("Never invent a metric");
  });

  it("omits the craft section when there is no addenda", () => {
    expect(systemPrompt("text")).not.toContain("## Workspace craft");
  });
});

describe("workspaceShowsPacketPicker", () => {
  const empty = {
    seedSuppressed: false,
    order: [] as string[],
    blankWorkspace: false,
    packetPickerRequested: false,
  };

  it("shows on a first-run empty workspace", () => {
    expect(workspaceShowsPacketPicker(empty)).toBe(true);
  });

  it("hides when the user chose blank, until they ask again", () => {
    expect(workspaceShowsPacketPicker({ ...empty, blankWorkspace: true })).toBe(false);
    expect(
      workspaceShowsPacketPicker({
        ...empty,
        blankWorkspace: true,
        packetPickerRequested: true,
      }),
    ).toBe(true);
  });

  it("hides for e2e suppression and for a workspace that already has documents", () => {
    expect(workspaceShowsPacketPicker({ ...empty, seedSuppressed: true })).toBe(false);
    expect(workspaceShowsPacketPicker({ ...empty, order: ["doc_1"] })).toBe(false);
  });
});
