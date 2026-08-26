"use client";

import { useCallback, useEffect, useState } from "react";
import type { MiniDoc } from "@/lib/docs/schema";
import { newRecordId } from "@/lib/docs/ids";
import { useWorkspace, type PaneIndex } from "@/lib/store/workspace";
import { Button, cx } from "@/components/ui";

export default function MiniSurface({
  doc,
}: {
  doc: MiniDoc;
  paneIndex: PaneIndex;
}) {
  const commit = useWorkspace((s) => s.commit);
  const setSelection = useWorkspace((s) => s.setSelection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { descriptor, records } = doc.body;

  useEffect(() => () => setSelection(doc.id, null), [doc.id, setSelection]);

  const select = useCallback(
    (recordId: string | null, fieldId: string | null = null) => {
      setSelectedId(recordId);
      setSelection(doc.id, recordId ? { kind: "mini", recordId, fieldId } : null);
    },
    [doc.id, setSelection],
  );

  const addRecord = () => {
    const id = newRecordId();
    commit(doc.id, [{ op: "addRecord", record: { id, values: {} } }], { label: "Add record" });
    select(id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-xs font-medium text-ink">{descriptor.label}</span>
        <span className="text-[10px] uppercase tracking-wide text-faint">{descriptor.template}</span>
        <Button size="sm" className="ml-auto" onClick={addRecord}>
          Add record
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {descriptor.template === "card-grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => select(record.id)}
                className={cx(
                  "rounded-lg border bg-raised p-3 text-left text-xs",
                  selectedId === record.id ? "border-accent" : "border-line",
                )}
              >
                {descriptor.fields.map((field) => (
                  <div key={field.id} className="mb-1">
                    <div className="text-[10px] text-faint">{field.name}</div>
                    <div>{String(record.values[field.id] ?? "")}</div>
                  </div>
                ))}
              </button>
            ))}
          </div>
        ) : descriptor.template === "timeline" ? (
          <ol className="space-y-2">
            {records.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  onClick={() => select(record.id)}
                  className={cx(
                    "w-full rounded-md border px-3 py-2 text-left text-xs",
                    selectedId === record.id ? "border-accent bg-accent/5" : "border-line",
                  )}
                >
                  {descriptor.fields.map((field) => (
                    <span key={field.id} className="mr-3">
                      <span className="text-faint">{field.name}: </span>
                      {String(record.values[field.id] ?? "")}
                    </span>
                  ))}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {descriptor.fields.map((field) => (
                  <th key={field.id} className="border-b border-line px-2 py-1 text-left text-muted">
                    {field.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className={cx(selectedId === record.id && "bg-accent/10")}
                  onClick={() => select(record.id)}
                >
                  {descriptor.fields.map((field) => (
                    <td key={field.id} className="border-b border-line px-2 py-1">
                      <input
                        className="w-full bg-transparent outline-none"
                        value={String(record.values[field.id] ?? "")}
                        onChange={(e) =>
                          commit(
                            doc.id,
                            [{ op: "setField", recordId: record.id, fieldId: field.id, value: e.target.value }],
                            {
                              coalesceKey: `mini:${record.id}:${field.id}`,
                              label: "Edit",
                            },
                          )
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
