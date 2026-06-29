import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface AppState {
  isReady: boolean;
  /** First name set during onboarding. Empty string = not yet onboarded. */
  userName: string;
  setReady: (ready: boolean) => void;
  setUserName: (name: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isReady:  false,
      userName: '',
      setReady:    (ready) => set({ isReady: ready }),
      setUserName: (name)  => set({ userName: name.trim() }),
    }),
    {
      name:    'rhythmmind-app-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
