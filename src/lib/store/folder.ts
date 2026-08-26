import { folderManifest, setPrimaryStorage, type WorkspacePayload } from "./storage";

type DirectoryHandle = {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
    getFile(): Promise<File>;
  }>;
};

let folderHandle: DirectoryHandle | null = null;

export function getFolderHandle(): DirectoryHandle | null {
  return folderHandle;
}

export function folderPickerSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickFolder(): Promise<DirectoryHandle | null> {
  if (!folderPickerSupported()) {
    throw new Error("Folder worktrees need a browser with the File System Access API.");
  }
  const picker = (window as unknown as { showDirectoryPicker: () => Promise<DirectoryHandle> })
    .showDirectoryPicker;
  folderHandle = await picker();
  setPrimaryStorage("folder");
  return folderHandle;
}

export async function writeWorktree(payload: WorkspacePayload): Promise<void> {
  if (!folderHandle) throw new Error("No folder is open.");
  const manifestHandle = await folderHandle.getFileHandle("garden.json", { create: true });
  const writable = await manifestHandle.createWritable();
  const body = {
    ...folderManifest(payload),
    docs: payload.docs,
  };
  await writable.write(JSON.stringify(body, null, 2));
  await writable.close();
}

export async function readWorktree(): Promise<WorkspacePayload | null> {
  if (!folderHandle) return null;
  try {
    const handle = await folderHandle.getFileHandle("garden.json");
    const file = await handle.getFile();
    const parsed = JSON.parse(await file.text()) as WorkspacePayload & { docs?: WorkspacePayload["docs"] };
    if (!Array.isArray(parsed.docs) || !Array.isArray(parsed.order)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function closeFolder(): void {
  folderHandle = null;
  setPrimaryStorage("dexie");
}
