import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface RecentSearches {
  items: string[];
  add: (query: string) => void;
  clear: () => void;
}

/** Недавние запросы — только на устройстве пользователя (без отправки на сервер). */
export const useRecentSearches = create<RecentSearches>()(
  persist(
    (set) => ({
      items: [],
      add: (query) => set((state) => ({ items: [query, ...state.items.filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 6) })),
      clear: () => set({ items: [] }),
    }),
    { name: 'mly-recent-searches', storage: createJSONStorage(() => localStorage) },
  ),
);
