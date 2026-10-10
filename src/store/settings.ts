import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { QualityPreset } from "../resolver/resolver";

interface SettingsState {
  quality: QualityPreset;
  setQuality(quality: QualityPreset): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: "addon",
      setQuality: (quality) => set({ quality }),
    }),
    { name: "freeband.settings", version: 1 },
  ),
);
