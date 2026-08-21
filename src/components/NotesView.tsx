import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Trash2, 
  Pin, 
  FileText, 
  Clock, 
  Check, 
  Edit3,
  AlignLeft
} from 'lucide-react';
import { Note } from '../types';
import { spideyApi } from '../services/spideyApi';

interface NotesViewProps {
  notes: Note[];
  onNotesUpdated: () => void;
}

export const NotesView: React.FC<NotesViewProps> = ({ notes, onNotesUpdated }) => {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(notes[0]?.id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Active note state for editing
  const [activeTitle, setActiveTitle] = useState('');
  const [activeContent, setActiveContent] = useState('');
  const [isSaved, setIsSaved] = useState(true);

  // Sync selected note into editor
  const selectedNote = notes.find((n) => n.id === selectedNoteId);

  useEffect(() => {
    if (selectedNote) {
      setActiveTitle(selectedNote.title);
      setActiveContent(selectedNote.content);
      setIsSaved(true);
    } else if (notes.length > 0 && !isCreatingNew) {
      setSelectedNoteId(notes[0].id);
    }
  }, [selectedNoteId, notes, isCreatingNew]);

  // Handle Note Auto-Save on change with debounce
  useEffect(() => {
    if (!selectedNote || isCreatingNew) return;

    if (activeTitle !== selectedNote.title || activeContent !== selectedNote.content) {
      setIsSaved(false);
      const timer = setTimeout(() => {
        spideyApi.updateNote(selectedNote.id, {
          title: activeTitle,
          content: activeContent,
        });
        setIsSaved(true);
        onNotesUpdated();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [activeTitle, activeContent, selectedNote, isCreatingNew, onNotesUpdated]);

  const handleStartCreateNew = () => {
    const newNote = spideyApi.createNote({
      title: 'Untitled Note',
      content: '',
    });
    setSelectedNoteId(newNote.id);
    setActiveTitle(newNote.title);
    setActiveContent(newNote.content);
    setIsCreatingNew(false);
    onNotesUpdated();
  };

  const handleDeleteNote = (noteId: string) => {
    spideyApi.deleteNote(noteId);
    if (selectedNoteId === noteId) {
      const remaining = notes.filter((n) => n.id !== noteId);
      setSelectedNoteId(remaining[0]?.id || null);
    }
    onNotesUpdated();
  };

  const handleTogglePin = (note: Note) => {
    spideyApi.updateNote(note.id, { pinned: !note.pinned });
    onNotesUpdated();
  };

  // Filter notes
  const filteredNotes = notes.filter((n) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
  });

  // Sort pinned on top
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 min-h-[550px] animate-in fade-in duration-200">
      {/* Left Column: Note List & Search */}
      <div className="md:col-span-4 rounded-xl bg-[#0e0e12] border border-neutral-800/80 p-3.5 sm:p-4 flex flex-col gap-3 shadow-md h-full">
        {/* Header & New Note Button */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800/70">
          <span className="text-xs font-mono-code uppercase tracking-wider text-zinc-400 font-semibold">
            Notes ({notes.length})
          </span>
          <button
            onClick={handleStartCreateNew}
            className="flex items-center gap-1 px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-zinc-200 border border-neutral-700/80 rounded-lg text-xs font-mono-code transition cursor-pointer"
            title="Create new note"
          >
            <Plus className="w-3.5 h-3.5 text-red-400" />
            <span>New</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full pl-8 pr-3 py-1.5 bg-neutral-950/70 border border-neutral-800/80 rounded-lg text-xs font-mono-code text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-neutral-700"
          />
        </div>

        {/* Notes Scrollable List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 max-h-[480px]">
          {sortedNotes.length === 0 ? (
            <div className="py-10 text-center text-xs font-mono-code text-zinc-600">
              {searchQuery ? 'No matching notes' : 'No notes yet. Click New to create one.'}
            </div>
          ) : (
            sortedNotes.map((note) => {
              const isSelected = note.id === selectedNoteId;
              const formattedDate = new Date(note.updatedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
              });

              return (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`group p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-neutral-800/90 border-neutral-700 shadow-sm'
                      : 'bg-[#121217]/60 border-neutral-800/60 hover:bg-neutral-800/40 hover:border-neutral-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <h4 className="text-xs font-semibold text-zinc-100 truncate flex-1">
                      {note.title || 'Untitled Note'}
                    </h4>
                    {note.pinned && (
                      <Pin className="w-3 h-3 text-red-400 fill-red-400/40 flex-shrink-0" />
                    )}
                  </div>

                  <p className="text-[11px] font-mono-code text-zinc-500 line-clamp-2 leading-relaxed">
                    {note.content ? note.content.replace(/[\n\r]+/g, ' ') : 'Empty note...'}
                  </p>

                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-neutral-800/50 text-[10px] font-mono-code text-zinc-600">
                    <span>{formattedDate}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNote(note.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-0.5 transition"
                      title="Delete note"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Note Editor */}
      <div className="md:col-span-8 rounded-xl bg-[#0e0e12] border border-neutral-800/80 p-4 sm:p-6 flex flex-col shadow-md">
        {selectedNote ? (
          <div className="flex flex-col h-full space-y-4">
            {/* Note Editor Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800/70">
              <div className="flex items-center gap-2 text-xs font-mono-code text-zinc-500">
                <span>{isSaved ? 'Saved automatically' : 'Saving...'}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTogglePin(selectedNote)}
                  className={`p-1.5 rounded-lg border text-xs transition flex items-center gap-1 ${
                    selectedNote.pinned
                      ? 'bg-red-950/60 text-red-300 border-red-900/60'
                      : 'bg-neutral-900 text-zinc-400 border-neutral-800 hover:text-zinc-200'
                  }`}
                  title={selectedNote.pinned ? 'Unpin note' : 'Pin note to top'}
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-mono-code hidden sm:inline">
                    {selectedNote.pinned ? 'Pinned' : 'Pin'}
                  </span>
                </button>

                <button
                  onClick={() => handleDeleteNote(selectedNote.id)}
                  className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-zinc-400 hover:text-red-400 transition"
                  title="Delete this note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Note Title Input */}
            <input
              type="text"
              value={activeTitle}
              onChange={(e) => setActiveTitle(e.target.value)}
              placeholder="Note title..."
              className="w-full text-lg sm:text-xl font-heading font-bold text-zinc-100 bg-transparent border-b border-neutral-800/60 pb-2 focus:outline-none focus:border-neutral-600 placeholder-zinc-600"
            />

            {/* Note Content Textarea */}
            <textarea
              value={activeContent}
              onChange={(e) => setActiveContent(e.target.value)}
              placeholder="Start writing... (Spidey notes are kept clean, private, and ready for your future AI assistant)"
              className="w-full flex-1 min-h-[360px] bg-transparent text-xs sm:text-sm font-mono-code text-zinc-200 leading-relaxed placeholder-zinc-600 resize-none focus:outline-none"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-20 text-center">
            <FileText className="w-8 h-8 text-zinc-600 mb-3" />
            <h3 className="text-sm font-semibold text-zinc-400 mb-1 font-heading">
              No Note Selected
            </h3>
            <p className="text-xs font-mono-code text-zinc-600 mb-4 max-w-sm">
              Select a note from the list on the left or create a new note.
            </p>
            <button
              onClick={handleStartCreateNew}
              className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-zinc-200 border border-neutral-700 rounded-lg text-xs font-mono-code transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-red-400" />
              <span>Create Note</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
