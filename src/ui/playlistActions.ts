import type { PlaylistSummary, TrackSnapshot } from "../../shared/api";
import { errorMessage } from "../api/client";
import { useLibrary } from "../store/library";
import { confirmDialog, promptDialog, toast } from "./overlays";
import { links, navigate } from "./router";

/** Asks for a name, creates the playlist (optionally with tracks) and opens it. */
export async function createPlaylistFlow(tracks?: TrackSnapshot[]): Promise<void> {
  const name = await promptDialog({ title: "Create playlist", label: "Name", placeholder: "My playlist", confirmLabel: "Create" });
  if (!name) return;
  try {
    const { playlist } = await useLibrary.getState().createPlaylist({ name, tracks });
    navigate(links.playlist(playlist.id));
  } catch (error) {
    toast(errorMessage(error));
  }
}

/** Confirms, deletes the playlist and leaves its page. */
export async function deletePlaylistFlow(playlist: PlaylistSummary): Promise<void> {
  const ok = await confirmDialog({
    title: "Delete playlist?",
    message: `This will delete “${playlist.name}” for good.`,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  try {
    await useLibrary.getState().deletePlaylist(playlist.id);
    toast("Playlist deleted");
    if (window.location.pathname === links.playlist(playlist.id)) navigate(links.library, true);
  } catch (error) {
    toast(errorMessage(error));
  }
}
