import { useAddons } from "./addons";
import { useAuth } from "./auth";
import { useLibrary } from "./library";
import { usePlayback } from "./playback";
import { useSettings } from "./settings";

/** Loads the signed-in user's data, and drops it on sign-out. Call once at startup. */
export function startSession(): void {
  let userId: string | null = null;
  useAuth.subscribe((state) => {
    const id = state.status === "signedIn" ? (state.user?.id ?? null) : null;
    if (id === userId) return;
    if (userId) clear();
    userId = id;
    if (id) void load();
  });
  void useAuth.getState().init();
}

async function load() {
  // Settings first: the playback store reads the quality preference.
  await useSettings.getState().load().catch(() => {});
  await Promise.allSettled([
    useAddons.getState().load(),
    useLibrary.getState().load(),
    usePlayback.getState().load(),
  ]);
  // Pick up manifest changes in the background.
  void useAddons.getState().refresh().catch(() => {});
}

function clear() {
  usePlayback.getState().reset();
  useAddons.getState().reset();
  useLibrary.getState().reset();
  useSettings.getState().reset();
}
