import { create } from 'zustand';

interface SchemeState {
  categories: any;
  lastSaved: string | null;
  finishedAt: string | null;
  setCategories: (cats: any) => void;
  setLastSaved: (time: string) => void;
  setFinishedAt: (time: string) => void;
}

export const useSchemeStore = create<SchemeState>((set) => ({
  categories: null,
  lastSaved: null,
  finishedAt: null,
  setCategories: (cats) => set({ categories: cats }),
  setLastSaved: (time) => set({ lastSaved: time }),
  setFinishedAt: (time) => set({ finishedAt: time })
}));
