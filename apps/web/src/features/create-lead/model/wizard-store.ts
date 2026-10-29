import { create } from 'zustand';

export interface LeadPrefill {
  masterIds?: string[];
  masterNames?: string[];
  serviceId?: string | null;
  modelId?: string | null;
  brandId?: string | null;
  description?: string;
  urgent?: boolean;
}

interface WizardState {
  open: boolean;
  prefill: LeadPrefill;
  openWizard: (prefill?: LeadPrefill) => void;
  close: () => void;
}

/** Мастер заявки открывается из любой точки (профиль, выдача, AI-ассистент, FAB) — один экземпляр на приложение. */
export const useLeadWizard = create<WizardState>((set) => ({
  open: false,
  prefill: {},
  openWizard: (prefill = {}) => set({ open: true, prefill }),
  close: () => set({ open: false }),
}));
