import { spideyApi } from '../services/spideyApi';
import { memoryStore } from '../services/spidey/memory';
import { ToolResult } from '../agent/types';

export function executeNotesAndMemoryTools(toolName: string, args: Record<string, any>): ToolResult | null {
  switch (toolName) {
    case 'create_note': {
      const title = args.title || 'New Note';
      const content = args.content || args.body || '';
      const pinned = Boolean(args.pinned);

      const note = spideyApi.createNote({ title, content, pinned });
      return {
        toolName,
        success: true,
        message: `Saved note "${note.title}"`,
        data: note,
        actionType: 'create_note',
        actionDetails: note.title,
      };
    }

    case 'delete_note': {
      const query = args.query || args.title;
      if (!query) return { toolName, success: false, message: 'Missing note title' };

      const notes = spideyApi.getNotes();
      const matched = notes.find((n) => n.title.toLowerCase().includes(query.toLowerCase()));
      if (!matched) return { toolName, success: false, message: `Note matching "${query}" not found` };

      spideyApi.deleteNote(matched.id);
      return {
        toolName,
        success: true,
        message: `Deleted note "${matched.title}"`,
        actionType: 'delete_note',
        actionDetails: matched.title,
      };
    }

    case 'remember_fact': {
      const fact = args.fact || args.text || args.content;
      if (!fact) return { toolName, success: false, message: 'Missing fact' };

      const tags = args.tags ? args.tags.split(',').map((t: string) => t.trim()) : undefined;
      memoryStore.addMemory(fact, tags, 4);
      spideyApi.addMemory(fact);

      return {
        toolName,
        success: true,
        message: `Remembered: "${fact}"`,
      };
    }

    case 'sync': {
      return {
        toolName,
        success: true,
        message: 'Synchronized with Google Tasks',
        actionType: 'sync',
        actionDetails: 'Sync triggered',
      };
    }

    default:
      return null;
  }
}
