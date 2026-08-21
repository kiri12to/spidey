import { SpideyMemoryItem } from './types';
import { initialMemories } from '../storage';

const MEMORY_STORAGE_KEY = 'spidey_memory_v2';

class MemoryStore {
  private memories: SpideyMemoryItem[] = [];

  constructor() {
    this.load();
  }

  private load(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (raw) {
        this.memories = JSON.parse(raw);
      } else {
        // Migrate initial memories
        this.memories = initialMemories.map((text, idx) => ({
          id: `mem-init-${idx}`,
          fact: text,
          tags: this.extractTags(text),
          importance: 4,
          createdAt: new Date().toISOString(),
          hitCount: 0,
        }));
        this.save();
      }
    } catch (e) {
      console.warn('Failed to load Spidey Memory 2.0:', e);
    }
  }

  private save(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.memories));
    } catch (e) {
      console.error('Failed to save Spidey Memory 2.0:', e);
    }
  }

  private extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags: string[] = [];
    if (lower.includes('anas') || lower.includes('kiri') || lower.includes('name') || lower.includes('morocco')) tags.push('identity');
    if (lower.includes('sre') || lower.includes('career') || lower.includes('job') || lower.includes('english') || lower.includes('teacher')) tags.push('career');
    if (lower.includes('hardware') || lower.includes('esp32') || lower.includes('arduino') || lower.includes('robot') || lower.includes('maker')) tags.push('maker');
    if (lower.includes('workout') || lower.includes('gym') || lower.includes('bench') || lower.includes('fitness')) tags.push('fitness');
    if (lower.includes('spidey') || lower.includes('app') || lower.includes('code') || lower.includes('programming')) tags.push('project');
    if (lower.includes('study') || lower.includes('math') || lower.includes('physics') || lower.includes('vocab')) tags.push('study');
    return tags;
  }

  public getAll(): SpideyMemoryItem[] {
    return [...this.memories];
  }

  public getAllFacts(): string[] {
    return this.memories.map((m) => m.fact);
  }

  public addMemory(fact: string, tags?: string[], importance: number = 3): SpideyMemoryItem {
    const cleanFact = fact.trim();
    if (!cleanFact) throw new Error('Cannot save empty memory');

    // Avoid exact duplicate
    const existing = this.memories.find((m) => m.fact.toLowerCase() === cleanFact.toLowerCase());
    if (existing) {
      existing.importance = Math.max(existing.importance || 3, importance);
      existing.lastAccessedAt = new Date().toISOString();
      this.save();
      return existing;
    }

    const newMem: SpideyMemoryItem = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fact: cleanFact,
      tags: tags && tags.length > 0 ? tags : this.extractTags(cleanFact),
      importance,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      hitCount: 1,
    };

    this.memories.unshift(newMem);
    this.save();
    return newMem;
  }

  public removeMemory(idOrFact: string): boolean {
    const initLen = this.memories.length;
    this.memories = this.memories.filter((m) => m.id !== idOrFact && !m.fact.toLowerCase().includes(idOrFact.toLowerCase()));
    if (this.memories.length !== initLen) {
      this.save();
      return true;
    }
    return false;
  }

  /**
   * Phase 4 — Retrieval-Based Memory
   * Scores memories based on relevance to the current user prompt / topic
   * rather than returning a naive slice.
   */
  public retrieveRelevantMemories(query: string, maxItems: number = 5): string[] {
    if (!query || !query.trim()) {
      // Return top importance memories if no specific query
      return this.memories
        .slice()
        .sort((a, b) => (b.importance || 3) - (a.importance || 3))
        .slice(0, maxItems)
        .map((m) => m.fact);
    }

    const queryTokens = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const scored = this.memories.map((mem) => {
      let score = 0;
      const factLower = mem.fact.toLowerCase();
      const tags = mem.tags || [];

      // Token matches
      for (const token of queryTokens) {
        if (factLower.includes(token)) {
          score += 3;
        }
        if (tags.some((t) => t.includes(token) || token.includes(t))) {
          score += 4;
        }
      }

      // Exact phrase bonus
      if (query.length > 5 && factLower.includes(query.toLowerCase())) {
        score += 8;
      }

      // Base importance multiplier
      score += (mem.importance || 3) * 0.5;

      return { mem, score };
    });

    // Sort by descending score
    scored.sort((a, b) => b.score - a.score);

    // Pick top relevant items
    const relevant = scored.slice(0, maxItems).map((s) => {
      // Record access hit
      s.mem.hitCount = (s.mem.hitCount || 0) + 1;
      s.mem.lastAccessedAt = new Date().toISOString();
      return s.mem.fact;
    });

    this.save();
    return relevant;
  }
}

export const memoryStore = new MemoryStore();
