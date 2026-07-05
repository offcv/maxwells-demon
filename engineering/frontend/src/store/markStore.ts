import { create } from 'zustand';

interface MarkState {
  marks: Record<string, string>; // path -> mark
  setMarks: (marks: Record<string, string>) => void;
  updateMark: (path: string, mark: string | null) => void;
}

export const useMarkStore = create<MarkState>((set) => ({
  marks: {},
  setMarks: (marks) => set({ marks }),
  updateMark: (path, mark) => set((state) => {
    const newMarks = { ...state.marks };
    if (mark === null) {
      delete newMarks[path];
    } else {
      newMarks[path] = mark;
    }
    return { marks: newMarks };
  })
}));
