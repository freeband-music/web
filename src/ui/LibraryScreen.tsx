import { useState, type FormEvent } from "react";
import { errorMessage } from "../api/client";
import { useLibrary } from "../store/library";
import { artistNames, Cover } from "./common";
import { links, navigate } from "./router";

/** A plain list of everything in the library. */
export function LibraryScreen() {
  const { playlists, followedPlaylists, albums, artists, likedCount } = useLibrary();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      const { playlist } = await useLibrary.getState().createPlaylist({ name: name.trim() });
      setName("");
      navigate(links.playlist(playlist.id));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="screen">
      <h1>Library</h1>
      <p className="muted">Liked songs: {likedCount}</p>

      <h2>Playlists</h2>
      <form className="install" onSubmit={create}>
        <input type="text" placeholder="New playlist" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="button primary" disabled={!name.trim()}>
          Create
        </button>
      </form>
      {error && <p className="status error">{error}</p>}
      <ul className="list-links">
        {[...playlists, ...followedPlaylists].map((p) => (
          <li key={p.id}>
            <a href={links.playlist(p.id)}>{p.name}</a>{" "}
            <span className="muted">
              · {p.trackCount} tracks{p.isOwner ? "" : ` · by ${p.owner.displayName}`}
              {p.visibility === "public" ? " · public" : ""}
            </span>
          </li>
        ))}
      </ul>

      {albums.length > 0 && <h2>Albums</h2>}
      <div className="grid">
        {albums.map(({ album }) => (
          <a key={album.id} className="card" href={links.album(album.id)}>
            <Cover src={album.cover} />
            <span className="card-title">{album.title}</span>
            <span className="muted">{artistNames(album.artists)}</span>
          </a>
        ))}
      </div>

      {artists.length > 0 && <h2>Artists</h2>}
      <div className="grid">
        {artists.map(({ artist }) => (
          <a key={artist.id} className="card" href={links.artist(artist.id)}>
            <Cover src={artist.image} round />
            <span className="card-title">{artist.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
