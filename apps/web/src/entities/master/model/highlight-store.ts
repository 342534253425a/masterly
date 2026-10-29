import { create } from 'zustand';

interface HighlightState {
  hoveredId: string | null;
  selectedId: string | null;
  hover: (id: string | null) => void;
  select: (id: string | null) => void;
}

/** Синхронизация «карточка ↔ пин на карте» между независимыми виджетами. */
export const useMasterHighlight = create<HighlightState>((set) => ({
  hoveredId: null,
  selectedId: null,
  hover: (hoveredId) => set({ hoveredId }),
  select: (selectedId) => set({ selectedId }),
}));
