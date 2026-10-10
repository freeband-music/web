import { create } from "zustand";
import type { AddonFailure, AddonInfo } from "../../shared/api";
import { addons as api } from "../api/client";
import type { Resource } from "../types";

interface AddonsState {
  addons: AddonInfo[];
  /** Add-ons whose manifest could not be fetched on the last refresh. */
  errors: AddonFailure[];
  loaded: boolean;
  load(): Promise<void>;
  /** Refetches every installed manifest; an add-on that fails keeps its stored one. */
  refresh(): Promise<void>;
  install(url: string): Promise<AddonInfo>;
  remove(id: string): Promise<void>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  move(index: number, delta: -1 | 1): Promise<void>;
  reset(): void;
}

/** The user's add-ons, stored on the server. Only base URLs are ever shown. */
export const useAddons = create<AddonsState>()((set, get) => ({
  addons: [],
  errors: [],
  loaded: false,
  async load() {
    const { addons } = await api.list();
    set({ addons, loaded: true });
  },
  async refresh() {
    const { addons, errors } = await api.refresh();
    set({ addons, errors: errors ?? [], loaded: true });
  },
  async install(url) {
    const { addon } = await api.install(url.trim());
    set({ addons: [...get().addons, addon] });
    return addon;
  },
  async remove(id) {
    await api.remove(id);
    await get().load();
  },
  async setEnabled(id, enabled) {
    const { addon } = await api.update(id, { enabled });
    set({ addons: get().addons.map((a) => (a.id === id ? addon : a)) });
  },
  async move(index, delta) {
    const ids = get().addons.map((a) => a.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const before = get().addons;
    set({ addons: ids.map((id) => before.find((a) => a.id === id)!) });
    try {
      set({ addons: (await api.reorder(ids)).addons });
    } catch (error) {
      set({ addons: before });
      throw error;
    }
  },
  reset: () => set({ addons: [], errors: [], loaded: false }),
}));

/** Whether an enabled add-on offers the resource. */
export function hasResource(addons: AddonInfo[], resource: Resource): boolean {
  return addons.some((a) => a.enabled && a.manifest.resources.includes(resource));
}
