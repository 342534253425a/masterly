import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface ShellState {
  collapsed: boolean;
  toggle: () => void;
}

export const useShellPrefs = create<ShellState>()(
  persist((set) => ({ collapsed: false, toggle: () => set((state) => ({ collapsed: !state.collapsed })) }), {
    name: 'mly-shell',
    storage: createJSONStorage(() => localStorage),
  }),
);
