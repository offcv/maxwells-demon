import { create } from 'zustand';

interface ScanPath {
  path: string;
  is_exclude: boolean;
}

interface ScanState {
  scanPaths: ScanPath[];
  sessionId: string | null;
  status: 'idle' | 'phase1' | 'phase2' | 'done' | 'cancelled' | 'error';
  phase1: { scanned: number; current_file: string } | null;
  phase2: { computed: number; total_candidates: number; percent: number; current_file: string } | null;
  elapsedSec: number;
  remainingSec: number;
  
  setScanPaths: (paths: ScanPath[]) => void;
  setSessionId: (id: string) => void;
  setStatus: (status: any) => void;
  updateProgress: (data: any) => void;
  reset: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  scanPaths: [],
  sessionId: null,
  status: 'idle',
  phase1: null,
  phase2: null,
  elapsedSec: 0,
  remainingSec: 0,
  
  setScanPaths: (paths) => set({ scanPaths: paths }),
  setSessionId: (id) => {
    console.log('scanStore: Setting sessionId to:', id);
    set({ sessionId: id });
  },
  setStatus: (status) => set({ status }),
  updateProgress: (data) => set((state) => ({
    status: data.status,
    phase1: data.phase1 || state.phase1,
    phase2: data.phase2 || state.phase2,
    elapsedSec: data.elapsed_sec,
    remainingSec: data.remaining_estimate_sec || 0
  })),
  reset: () => {
    console.log('scanStore: Resetting state.');
    set({
      scanPaths: [], sessionId: null, status: 'idle', phase1: null, phase2: null, elapsedSec: 0, remainingSec: 0
    });
  }
}));
