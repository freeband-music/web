import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createAddonClient, installAddon, type InstalledAddon } from "../addons/client";

interface AddonsState {
  addons: InstalledAddon[];
  /** Base URLs of add-ons that did not answer the last refresh. Not persisted. */
  offline: string[];
  /** Refetches every installed manifest; an add-on that fails keeps its stored one. */
  refresh(): Promise<void>;
  /** Installs an add-on, or refreshes it when the URL is already installed. */
  install(url: string): Promise<InstalledAddon>;
  remove(baseUrl: string): void;
  move(index: number, delta: -1 | 1): void;
}

export const useAddons = create<AddonsState>()(
  persist(
    (set, get) => ({
      addons: [],
      offline: [],
      async refresh() {
        const asked = get().addons.map((a) => a.baseUrl);
        const settled = await Promise.allSettled(asked.map((url) => installAddon(url)));
        const fresh = new Map<string, InstalledAddon>();
        const offline: string[] = [];
        settled.forEach((result, i) => {
          if (result.status === "fulfilled") fresh.set(asked[i], { baseUrl: asked[i], manifest: result.value.manifest });
          else offline.push(asked[i]);
        });
        set({ addons: get().addons.map((a) => fresh.get(a.baseUrl) ?? a), offline });
      },
      async install(url) {
        const addon = await installAddon(url);
        const addons = get().addons;
        const existing = addons.findIndex((a) => a.baseUrl === addon.baseUrl);
        set({
          addons: existing < 0 ? [...addons, addon] : addons.map((a, i) => (i === existing ? addon : a)),
          offline: get().offline.filter((url) => url !== addon.baseUrl),
        });
        return addon;
      },
      remove: (baseUrl) => set({ addons: get().addons.filter((a) => a.baseUrl !== baseUrl) }),
      move(index, delta) {
        const addons = [...get().addons];
        const target = index + delta;
        if (target < 0 || target >= addons.length) return;
        [addons[index], addons[target]] = [addons[target], addons[index]];
        set({ addons });
      },
    }),
    { name: "freeband.addons", version: 1, partialize: (state) => ({ addons: state.addons }) },
  ),
);

export const addonClient = createAddonClient(() => useAddons.getState().addons);
