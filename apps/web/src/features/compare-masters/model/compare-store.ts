import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface CompareEntry {
  id: string;
  name: string;
  initials: string;
  hue: number;
}

export const COMPARE_LIMIT = 4;

interface CompareState {
  items: CompareEntry[];
  /** Возвращает false, если достигнут лимит. */
  toggle: (entry: CompareEntry) => boolean;
  remove: (id: string) => void;
  clear: () => void;
}

/** Список сравнения доступен без регистрации — хранится локально. */
export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (entry) => {
        const { items } = get();
        if (items.some((item) => item.id === entry.id)) {
          set({ items: items.filter((item) => item.id !== entry.id) });
          return true;
        }
        if (items.length >= COMPARE_LIMIT) return false;
        set({ items: [...items, entry] });
        return true;
      },
      remove: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'mly-compare', storage: createJSONStorage(() => localStorage) },
  ),
);
