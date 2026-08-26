import type { ComponentType } from "react";
import type { ZodType } from "zod";
import type { LucideIcon } from "lucide-react";
import type { Doc, DocKind } from "@/lib/docs/schema";
import type { SurfaceSelection } from "@/lib/store/workspace";
import type { MockRequest } from "@/lib/ai/mock";
import type { EditorAdapter } from "./adapter";

/**
 * How a surface sits against {@link EditorAdapter} today — including built-ins
 * that have not wrapped their React host yet. Status is `planned` when a later
 * suite issue will put a borrowed engine behind the contract.
 */
export type AdapterStatus = "not-required" | "planned" | "active";

export type EngineOwnership = "garden" | "borrowed";

export interface AdapterPosture {
  engine: EngineOwnership;
  status: AdapterStatus;
  /** `EditorAdapter.onUserEdit` — how gestures become ops today. */
  userEdits: string;
  /** `EditorAdapter.update` — how Garden state reaches the UI. */
  gardenUpdates: string;
  /** `readSelection` / `focusSelection` — what the surface publishes today. */
  selection: string;
  notes: string;
  relatedIssue?: number;
}

/**
 * Everything the app needs to know about a surface, gathered in one object.
 * Built-in surfaces and future custom surfaces register through the same shape.
 *
 * The `any` in body/doc positions is deliberate: the registry erases the per-
 * surface body type so it can hold all surfaces in one Map. Callers that need
 * type safety narrow through `DocOf<K>` after looking up the definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SurfaceDefinition<K extends DocKind = any> {
  kind: K;
  label: string;
  icon: LucideIcon;
  iconColor: string;

  opSchema: ZodType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyOps: (body: any, ops: any[]) => { body: any; inverse: any[] };
  createDoc: (title?: string) => Doc;
  ownsHistory: boolean;

  contextBudget: number;
  promptNotes: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serializeDoc: (doc: any, selection?: SurfaceSelection) => string;
  describeSelection: (selection: SurfaceSelection) => string | null;
  mockReply: (request: MockRequest) => string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describeOp: (op: any) => string | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  referencedBlobIds: (doc: any) => Set<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  remapBlobIds: (doc: any, map: Map<string, string>) => any;

  adapter: AdapterPosture;
  /**
   * Present when the surface borrows an editor engine. Garden-owned UIs omit it
   * until a later suite issue wraps them. The stub notes adapter is not a
   * `DocKind` and does not register here.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createAdapter?: () => EditorAdapter<any, any, any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  loadComponent: () => Promise<{ default: ComponentType<any> }>;
}
