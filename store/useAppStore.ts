import { create } from 'zustand';

interface AppState {
  isReady: boolean;
  setReady: (ready: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isReady: false,
  setReady: (ready) => set({ isReady: ready }),
}));
