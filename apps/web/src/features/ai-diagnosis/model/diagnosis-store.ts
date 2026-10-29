import { create } from 'zustand';

interface DiagnosisState {
  open: boolean;
  initial: string;
  openDiagnosis: (initial?: string) => void;
  close: () => void;
}

export const useAiDiagnosis = create<DiagnosisState>((set) => ({
  open: false,
  initial: '',
  openDiagnosis: (initial = '') => set({ open: true, initial }),
  close: () => set({ open: false }),
}));
