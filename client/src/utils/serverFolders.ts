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

export function renameOrRecolorFolder(
  folders: ServerFolder[],
  folderId: string,
  patch: { name?: string; color?: string }
): ServerFolder[] {
  return folders.map((f) => {
    if (f.id !== folderId) return f;
    return {
      ...f,
      ...(typeof patch.name === 'string' && patch.name.trim()
        ? { name: patch.name.trim().slice(0, 32) }
        : {}),
      ...(typeof patch.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.color)
        ? { color: patch.color }
        : {}),
    };
  });
}

export function moveServerToFolder(
  folders: ServerFolder[],
  serverId: string,
  targetFolderId: string
): ServerFolder[] {
  if (!serverId || !targetFolderId) return folders;
  return folders
    .map((f) => {
      const cleanedIds = f.serverIds.filter((id) => id !== serverId);
      if (f.id === targetFolderId) {
        return { ...f, serverIds: [...cleanedIds, serverId], collapsed: false };
      }
      return { ...f, serverIds: cleanedIds };
    })
    .filter((f) => f.serverIds.length > 0);
}

export function mergeServersIntoNewFolder(
  folders: ServerFolder[],
  draggedServerId: string,
  targetServerId: string,
  defaultName = 'Yeni Klasör'
): ServerFolder[] {
  if (!draggedServerId || !targetServerId || draggedServerId === targetServerId) {
    return folders;
  }
  const targetFolder = folders.find((f) => f.serverIds.includes(targetServerId));
  if (targetFolder) {
    return moveServerToFolder(folders, draggedServerId, targetFolder.id);
  }
  const cleaned = folders
    .map((f) => ({
      ...f,
      serverIds: f.serverIds.filter((id) => id !== draggedServerId && id !== targetServerId),
    }))
    .filter((f) => f.serverIds.length > 0);

  return [
    ...cleaned,
    {
      id: `fld-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(defaultName || 'Yeni Klasör').trim().slice(0, 32) || 'Yeni Klasör',
      color: DEFAULT_FOLDER_COLORS[cleaned.length % DEFAULT_FOLDER_COLORS.length],
      serverIds: [targetServerId, draggedServerId],
      collapsed: false,
    },
  ];
}
