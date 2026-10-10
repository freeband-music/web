import { addonClient } from "../store/addons";
import { Cover, useAsync } from "./common";
import { links } from "./router";

export function ArtistScreen({ id }: { id: string }) {
  const artist = useAsync(() => addonClient.getArtist(id), id);
  if (artist.loading) return <p className="screen muted">Loading…</p>;
  if ("error" in artist) return <p className="screen status error">{artist.error}</p>;
  const { name, image, albums } = artist.data;
  return (
    <div className="screen">
      <header className="hero">
        {image && <Cover src={image} round />}
        <div>
          <p className="muted">Artist</p>
          <h1>{name}</h1>
        </div>
      </header>
      <h2>Albums</h2>
      {albums.length === 0 && <p className="muted">No albums listed.</p>}
      <div className="grid">
        {albums.map((album) => (
          <a key={album.id} className="card" href={links.album(album.id)}>
            <Cover src={album.cover} />
            <span className="card-title">{album.title}</span>
            {album.year && <span className="muted">{album.year}</span>}
          </a>
        ))}
      </div>
    </div>
  );
}
