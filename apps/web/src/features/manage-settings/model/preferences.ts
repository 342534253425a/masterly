import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface InterfacePreferences {
  reducedMotion: boolean;
  largeText: boolean;
  highContrast: boolean;
}

interface PreferencesState extends InterfacePreferences {
  setPreference: <K extends keyof InterfacePreferences>(key: K, value: InterfacePreferences[K]) => void;
}

/** Настройки доступности работают и без аккаунта (localStorage), у вошедших — синхронизируются с профилем. */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      reducedMotion: false,
      largeText: false,
      highContrast: false,
      setPreference: (key, value) => set({ [key]: value } as Partial<PreferencesState>),
    }),
    { name: 'mly-preferences', storage: createJSONStorage(() => localStorage) },
  ),
);
