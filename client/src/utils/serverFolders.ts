export interface ServerFolder {
  id: string;
  name: string;
  color: string;
  serverIds: string[];
  collapsed: boolean;
}

export const SERVER_FOLDERS_STORAGE_KEY = 'dc_server_folders_v1';

export const DEFAULT_FOLDER_COLORS = [
  '#3b82f6',
  '#10b981',
  '#8b5cf6',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
] as const;

export function loadServerFolders(): ServerFolder[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SERVER_FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f): f is ServerFolder => Boolean(f && typeof f.id === 'string' && typeof f.name === 'string' && Array.isArray(f.serverIds)))
      .map((f) => ({
        id: f.id,
        name: String(f.name).slice(0, 32),
        color: typeof f.color === 'string' && f.color ? f.color : DEFAULT_FOLDER_COLORS[0],
        serverIds: Array.from(new Set(f.serverIds.filter((s): s is string => typeof s === 'string'))),
        collapsed: Boolean(f.collapsed),
      }));
  } catch {
    return [];
  }
}

export function saveServerFolders(folders: ServerFolder[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SERVER_FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch {}
}

export function createServerFolder(
  folders: ServerFolder[],
  name: string,
  initialServerId: string,
  color?: string
): ServerFolder[] {
  const cleanName = String(name || 'Yeni Klasör').trim().slice(0, 32) || 'Yeni Klasör';
  const cleaned = folders.map((f) => ({
    ...f,
    serverIds: f.serverIds.filter((id) => id !== initialServerId),
  })).filter((f) => f.serverIds.length > 0);

  const chosenColor = color || DEFAULT_FOLDER_COLORS[cleaned.length % DEFAULT_FOLDER_COLORS.length];
  return [
    ...cleaned,
    {
      id: `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      color: chosenColor,
      serverIds: [initialServerId],
      collapsed: false,
    },
  ];
}

export function toggleServerInFolder(
  folders: ServerFolder[],
  folderId: string,
  serverId: string
): ServerFolder[] {
  const target = folders.find((f) => f.id === folderId);
  if (!target) return folders;
  const alreadyMember = target.serverIds.includes(serverId);

  return folders
    .map((f) => {
      const withoutServer = f.serverIds.filter((id) => id !== serverId);
      if (f.id === folderId) {
        return {
          ...f,
          serverIds: alreadyMember ? withoutServer : [...withoutServer, serverId],
        };
      }
      return { ...f, serverIds: withoutServer };
    })
    .filter((f) => f.serverIds.length > 0);
}

export function toggleFolderCollapsed(folders: ServerFolder[], folderId: string): ServerFolder[] {
  return folders.map((f) => (f.id === folderId ? { ...f, collapsed: !f.collapsed } : f));
}

export function removeServerFolder(folders: ServerFolder[], folderId: string): ServerFolder[] {
  return folders.filter((f) => f.id !== folderId);
}
