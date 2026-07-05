import { create } from 'zustand';

interface ResultState {
  summary: any;
  setSummary: (summary: any) => void;
}

export const useResultStore = create<ResultState>((set) => ({
  summary: null,
  setSummary: (summary) => set({ summary })
}));
