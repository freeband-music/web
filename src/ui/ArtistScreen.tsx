import { content } from "../api/client";
import { useLibrary } from "../store/library";
import { artistSnapshot } from "../snapshots";
import { Card, CardGrid } from "./cards";
import { count, Cover, useAsync } from "./common";
import { toast } from "./overlays";
import { ActionBar, PageHeader } from "./page";
import { playAlbumById, playArtistById } from "./play";
import { links } from "./router";

export function ArtistScreen({ id }: { id: string }) {
  const artist = useAsync(() => content.artist(id), id);
  const followed = useLibrary((s) => s.artists.some((a) => a.artist.id === id));
  if (artist.loading) return <p className="screen muted">Loading…</p>;
  if ("error" in artist) return <p className="screen status error">{artist.error}</p>;
  const { name, image, albums } = artist.data;
  const toggleFollow = () =>
    void useLibrary
      .getState()
      .setArtistFollowed(artistSnapshot(artist.data), !followed)
      .then(
        () => toast(followed ? "Unfollowed" : `Following ${name}`),
        () => toast("Could not update Your Library."),
      );
  return (
    <div className="screen">
      <PageHeader round cover={<Cover src={image} round />} kind="Artist" title={name} meta={count(albums.length, "release")} />
      <ActionBar
        onPlay={albums.length ? () => playArtistById(id) : undefined}
        onShuffle={albums.length ? () => void playArtistById(id, true) : undefined}
      >
        <button className={followed ? "button outline active" : "button outline"} onClick={toggleFollow}>
          {followed ? "Following" : "Follow"}
        </button>
      </ActionBar>
      <h2>Discography</h2>
      {albums.length === 0 && <p className="muted">No albums listed.</p>}
      <CardGrid>
        {albums.map((album) => (
          <Card
            key={album.id}
            href={links.album(album.id)}
            cover={<Cover src={album.cover} />}
            title={album.title}
            subtitle={album.year ? String(album.year) : "Album"}
            onPlay={() => playAlbumById(album.id)}
          />
        ))}
      </CardGrid>
    </div>
  );
}
