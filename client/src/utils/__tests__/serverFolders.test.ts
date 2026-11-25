import { describe, it, expect } from 'vitest';
import {
  createServerFolder,
  toggleServerInFolder,
  toggleFolderCollapsed,
  removeServerFolder,
} from '../serverFolders';

describe('serverFolders', () => {
  it('creates folders, moves servers between folders, toggles collapse, and removes empty folders', () => {
    let folders = createServerFolder([], 'Oyun', 'srv-1', '#3b82f6');
    expect(folders).toHaveLength(1);
    expect(folders[0].serverIds).toEqual(['srv-1']);
    expect(folders[0].collapsed).toBe(false);

    folders = toggleServerInFolder(folders, folders[0].id, 'srv-2');
    expect(folders[0].serverIds).toEqual(['srv-1', 'srv-2']);

    folders = toggleFolderCollapsed(folders, folders[0].id);
    expect(folders[0].collapsed).toBe(true);

    // Moving srv-1 into a second folder cleanly removes it from first without deleting first
    folders = createServerFolder(folders, 'İş', 'srv-1', '#10b981');
    expect(folders).toHaveLength(2);
    expect(folders[0].serverIds).toEqual(['srv-2']);
    expect(folders[1].serverIds).toEqual(['srv-1']);

    // Removing last server from folder auto-prunes empty folder
    folders = toggleServerInFolder(folders, folders[0].id, 'srv-2');
    expect(folders).toHaveLength(1);

    folders = removeServerFolder(folders, folders[0].id);
    expect(folders).toEqual([]);
  });
});
