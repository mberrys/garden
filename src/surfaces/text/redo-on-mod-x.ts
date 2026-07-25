import { Extension } from "@tiptap/core";

/** Workspace redo binding — Ctrl/Cmd+X (cut is still available via context menu). */
export function redoOnModX() {
  return Extension.create({
    name: "redoOnModX",
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        "Mod-x": () => this.editor.commands.redo(),
      };
    },
  });
}
