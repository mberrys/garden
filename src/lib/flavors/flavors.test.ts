import { describe, expect, it } from "vitest";
import { flavorAddenda, getFlavor, listFlavors, rankByFlavor } from "./index";

describe("flavors", () => {
  it("never forks schemas — flavors are view-state data", () => {
    for (const flavor of listFlavors()) {
      expect(flavor.id.length).toBeGreaterThan(0);
      expect(flavor.chrome.density === "compact" || flavor.chrome.density === "comfortable" || flavor.chrome.density === "visual").toBe(true);
    }
  });

  it("default flavor has no addenda", () => {
    expect(flavorAddenda("default")).toBeUndefined();
    expect(getFlavor(null).id).toBe("default");
  });

  it("ranks suggested packets first without hiding the rest", () => {
    const items = [{ id: "a" }, { id: "comms/campaign" }, { id: "data/experiment-report" }];
    const ranked = rankByFlavor(items, "data", []);
    expect(ranked[0].id).toBe("data/experiment-report");
    expect(ranked.map((i) => i.id).sort()).toEqual(["a", "comms/campaign", "data/experiment-report"]);
  });
});
