export interface FlavorDefinition {
  id: string;
  label: string;
  description: string;
  layoutPreset?: string;
  surfaceEmphasis: string[];
  recipeSets: string[];
  packetSuggestions: string[];
  assistantPromptAddenda: string[];
  chrome: {
    density: "compact" | "comfortable" | "visual";
    primaryRail: string[];
  };
}

export const FLAVORS: FlavorDefinition[] = [
  {
    id: "default",
    label: "Default",
    description: "No lens. Every surface and recipe stays equally available.",
    surfaceEmphasis: [],
    recipeSets: [],
    packetSuggestions: [],
    assistantPromptAddenda: [],
    chrome: { density: "comfortable", primaryRail: [] },
  },
  {
    id: "developer",
    label: "Developer time",
    description: "Docs, architecture canvas, and structured tables first.",
    surfaceEmphasis: ["text", "canvas", "database"],
    recipeSets: ["spec", "architecture"],
    packetSuggestions: ["garden/grant-shop", "data/experiment-report"],
    assistantPromptAddenda: [
      "Bias toward explicit interfaces, invariants, failure modes, and implementation sequence. Do not hide decks or media.",
    ],
    chrome: { density: "compact", primaryRail: ["text", "canvas", "database"] },
  },
  {
    id: "art",
    label: "Art time",
    description: "Media, canvas, PDF, and decks first.",
    surfaceEmphasis: ["media", "canvas", "pdf", "deck"],
    recipeSets: ["critique", "presentation"],
    packetSuggestions: ["garden/field-notes", "comms/campaign"],
    assistantPromptAddenda: [
      "Bias toward composition, hierarchy, typography, and visual consistency. Documents remain valid.",
    ],
    chrome: { density: "visual", primaryRail: ["media", "canvas", "deck"] },
  },
  {
    id: "data",
    label: "Data time",
    description: "Bases, sheets, figures, and analysis writing first.",
    surfaceEmphasis: ["database", "sheet", "media", "text", "deck"],
    recipeSets: ["comparison", "findings"],
    packetSuggestions: ["data/experiment-report"],
    assistantPromptAddenda: [
      "Bias toward evidence, uncertainty, metrics, and provenance. Do not invent numbers.",
    ],
    chrome: { density: "comfortable", primaryRail: ["database", "sheet", "text"] },
  },
];

const BY_ID = new Map(FLAVORS.map((flavor) => [flavor.id, flavor]));

export function getFlavor(id: string | null | undefined): FlavorDefinition {
  return (id && BY_ID.get(id)) || FLAVORS[0];
}

export function listFlavors(): FlavorDefinition[] {
  return FLAVORS;
}

export function flavorAddenda(id: string | null | undefined): string | undefined {
  const parts = getFlavor(id).assistantPromptAddenda;
  return parts.length ? parts.join("\n") : undefined;
}

export function rankByFlavor<T extends { id: string }>(
  items: T[],
  flavorId: string | null | undefined,
  suggestedIds: string[],
): T[] {
  const flavor = getFlavor(flavorId);
  const preferred = new Set([...flavor.packetSuggestions, ...suggestedIds]);
  const head = items.filter((item) => preferred.has(item.id));
  const tail = items.filter((item) => !preferred.has(item.id));
  return [...head, ...tail];
}
