"use client";

import { useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { useThreads, type Suggestion } from "@/lib/ai/thread";
import { useWorkspace } from "@/lib/store/workspace";
import { getSurface } from "@/lib/surfaces";
import { Button, cx } from "../ui";
import { DocIcon } from "../doc-icon";

const COLLAPSE_AFTER = 4;

/**
 * The review gate. Every AI-authored change surfaces here as a readable list of
 * what it will do, and nothing touches a document until the user says so.
 */
export function SuggestionCard({ suggestionId }: { suggestionId: string }) {
  const suggestion = useThreads((s) => s.suggestions[suggestionId]);
  const accept = useThreads((s) => s.accept);
  const reject = useThreads((s) => s.reject);
  const targetDoc = useWorkspace((s) => (suggestion ? s.docs[suggestion.docId] : undefined));
  const openDoc = useWorkspace((s) => s.openDoc);
  const [expanded, setExpanded] = useState(false);

  if (!suggestion) return null;

  const shown = expanded ? suggestion.summaries : suggestion.summaries.slice(0, COLLAPSE_AFTER);
  const hidden = suggestion.summaries.length - shown.length;

  return (
    <div
      className={cx(
        "mt-2 overflow-hidden rounded-lg border text-xs",
        suggestion.status === "accepted"
          ? "border-transparent bg-ok-soft"
          : suggestion.status === "rejected"
            ? "border-line bg-sunken opacity-70"
            : suggestion.status === "failed"
              ? "border-transparent bg-danger-soft"
              : "border-line bg-raised",
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-line/60 px-2.5 py-1.5">
        <StatusIcon status={suggestion.status} />
        <span className="flex-1 font-medium text-ink">{headline(suggestion)}</span>
        {targetDoc && (
          <button
            type="button"
            onClick={() => openDoc(targetDoc.id)}
            title={`Open ${targetDoc.title}`}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted hover:bg-hover hover:text-ink"
          >
            <DocIcon kind={targetDoc.kind} size={11} />
            <span className="max-w-24 truncate">{targetDoc.title}</span>
          </button>
        )}
      </div>

      <ul className="px-2.5 py-1.5">
        {shown.map((summary, i) => (
          <li key={i} className="flex gap-1.5 py-0.5 text-muted">
            <span className="select-none text-faint">·</span>
            <span className="min-w-0 flex-1 leading-relaxed">{summary}</span>
          </li>
        ))}
        {hidden > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex items-center gap-1 py-0.5 text-faint hover:text-ink"
            >
              <ChevronRight size={11} />
              {hidden} more change{hidden === 1 ? "" : "s"}
            </button>
          </li>
        )}
        {expanded && suggestion.summaries.length > COLLAPSE_AFTER && (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="flex items-center gap-1 py-0.5 text-faint hover:text-ink"
            >
              <ChevronDown size={11} />
              Show less
            </button>
          </li>
        )}
      </ul>

      {suggestion.errors?.length ? (
        <p className="px-2.5 pb-2 leading-relaxed text-danger">{suggestion.errors.join("; ")}</p>
      ) : null}

      {suggestion.status === "pending" && (
        <div className="flex items-center gap-1.5 border-t border-line/60 px-2.5 py-1.5">
          <Button size="sm" variant="primary" onClick={() => accept(suggestion.id)}>
            <Check size={12} />
            Apply {suggestion.ops.length > 1 ? `all ${suggestion.ops.length}` : ""}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => reject(suggestion.id)}>
            Discard
          </Button>
          <span className="ml-auto text-[11px] text-faint">
            {getSurface(suggestion.kind).label}
          </span>
        </div>
      )}
    </div>
  );
}

function headline(suggestion: Suggestion): string {
  const count = suggestion.ops.length;
  switch (suggestion.status) {
    case "accepted":
      return `Applied ${count} change${count === 1 ? "" : "s"}`;
    case "rejected":
      return "Discarded";
    case "failed":
      return "Could not apply";
    default:
      return `${count} proposed change${count === 1 ? "" : "s"}`;
  }
}

function StatusIcon({ status }: { status: Suggestion["status"] }) {
  if (status === "accepted") return <Check size={13} className="text-ok" />;
  if (status === "rejected") return <X size={13} className="text-faint" />;
  if (status === "failed") return <AlertCircle size={13} className="text-danger" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-accent" />;
}
