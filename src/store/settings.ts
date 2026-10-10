import { create } from "zustand";
import type { UserSettings } from "../../shared/api";
import { me } from "../api/client";
import type { QualityPreset } from "../resolver/resolver";

const SAVE_DELAY_MS = 1000;
const QUALITIES: QualityPreset[] = ["addon", "data-saver", "balanced", "best"];

interface SettingsState {
  quality: QualityPreset;
  /** Let stream add-ons start a download when a track is not playable yet; the server must allow it too. */
  allowDownloads: boolean;
  /** Everything stored on the server, including keys this version does not know. */
  stored: UserSettings;
  load(): Promise<void>;
  reset(): void;
  setQuality(quality: QualityPreset): void;
  setAllowDownloads(allow: boolean): void;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function fromStored(stored: UserSettings): Pick<SettingsState, "quality" | "allowDownloads"> {
  const quality = stored.quality as QualityPreset;
  return { quality: QUALITIES.includes(quality) ? quality : "addon", allowDownloads: stored.allowDownloads === true };
}

/** Client settings, synced through the server (saved shortly after each change). */
export const useSettings = create<SettingsState>()((set, get) => {
  function update(patch: UserSettings) {
    const stored = { ...get().stored, ...patch };
    set({ stored, ...fromStored(stored) });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void me.saveSettings(get().stored).catch(() => {}), SAVE_DELAY_MS);
  }
  return {
    quality: "addon",
    allowDownloads: false,
    stored: {},
    async load() {
      const { settings } = await me.settings();
      set({ stored: settings, ...fromStored(settings) });
    },
    reset() {
      clearTimeout(saveTimer);
      set({ stored: {}, ...fromStored({}) });
    },
    setQuality: (quality) => update({ quality }),
    setAllowDownloads: (allowDownloads) => update({ allowDownloads }),
  };
});
