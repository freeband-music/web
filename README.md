# Freeband web

Freeband is an open-source music client in the style of add-on based media
centres. This repository is the web app (TypeScript, React, Vite) and its
server (Node, Fastify, Kysely). It ships with no add-ons and no content.
Everything it shows and plays comes from add-ons that each user installs.

An add-on is an HTTP server that speaks the
[Freeband add-on protocol](https://github.com/freeband-music/protocol).
Metadata add-ons provide search and artist, album and track information;
stream add-ons turn a track's details into playable URLs.

## Features

- Accounts; the first user to sign up becomes the admin. Sign-up can be
  open, invite-only or closed.
- Add-ons installed per user, by URL, stored encrypted on the server
- Search across metadata add-ons, in sections for tracks, albums, artists
  and playlists, with recent searches
- Artist and album pages
- Playlists, private or public; follow other users' public playlists
- Liked songs, saved albums and followed artists
- Listening history, recently played and listening stats
- Queue, playback state and settings synced across devices
- Server-side cache of add-on responses, and prefetching of upcoming streams
  and metadata
- Responsive layout for desktop and mobile

## Development

With Nix:

```
nix develop
pnpm install     # first time only
just dev         # server on :7010, web app on http://localhost:5173 (also on the LAN)
just check       # tests, type checks and production builds
```

Without Nix you need Node 22 and pnpm:

```
pnpm install
pnpm dev:server  # API server on port 7010, restarts on changes
pnpm dev         # web app on port 5173; proxies /api to the server
pnpm test
```

In development the server stores its database in `.dev/freeband.db` and
generates a secret key in `.dev/secret.key`.

## Production

```
pnpm install
pnpm build && pnpm build:server
NODE_ENV=production FREEBAND_SECRET_KEY=... pnpm start
```

(`just build` and `just start` do the same.) The server listens on port 7010,
serves the API under `/api` and the built web app from `dist/`, and applies
pending database migrations at start-up.

Generate a key with `openssl rand -base64 32`.

### Docker

```
docker build -t freeband-web .
docker run -d -p 7010:7010 -v freeband:/data \
  -e FREEBAND_SECRET_KEY=... freeband-web
```

The image runs as a non-root user and keeps its SQLite database in the
`/data` volume.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `NODE_ENV` | | `production` requires `FREEBAND_SECRET_KEY` |
| `FREEBAND_SECRET_KEY` | dev: `.dev/secret.key` | 32 bytes, base64 or hex; encrypts stored add-on URLs |
| `FREEBAND_PORT` | `7010` | Port to listen on |
| `FREEBAND_HOST` | `0.0.0.0` | Address to listen on |
| `DATABASE_URL` | `sqlite:.dev/freeband.db` | Database (Docker: `sqlite:/data/freeband.db`) |
| `FREEBAND_SIGNUP` | `open` | `open`, `invite` or `closed`; the admin's setting overrides it |
| `FREEBAND_COOKIE_SECURE` | `auto` | `true`, `false`, or `auto` (secure when the request is HTTPS) |
| `FREEBAND_TRUST_PROXY` | `false` | Trust `X-Forwarded-*` headers from a reverse proxy |
| `FREEBAND_STATIC_DIR` | `dist` | Built web app to serve |
| `FREEBAND_TTL_META` | `7d` | Cache lifetime of artist, album and track lookups |
| `FREEBAND_TTL_SEARCH` | `1d` | Cache lifetime of search results |
| `FREEBAND_TTL_MANIFEST` | `1h` | How often add-on manifests are refetched |
| `FREEBAND_TTL_STREAM` | `6h` | Cache lifetime of resolved streams |
| `FREEBAND_TTL_NOT_FOUND` | `1h` | Cache lifetime of "not found" answers |
| `FREEBAND_PREFETCH_CONCURRENCY` | `2` | Stream lookups running at once per user |
| `FREEBAND_PREFETCH_LIMIT` | `50` | Most upcoming tracks one prefetch covers |
| `FREEBAND_PREFETCH_QUEUE_AHEAD` | `3` | Upcoming tracks for which a stream add-on may start a download (only with downloads allowed) |
| `FREEBAND_ALLOW_DOWNLOADS` | `false` | Let users allow stream add-ons to start downloads (see below) |
| `FREEBAND_PROTOCOL` | `../protocol` | Protocol repository, for `just gen` only |

Durations take a number of seconds or a suffix: `90s`, `15m`, `6h`, `7d`.

### Downloads

By default Freeband plays only sources that are playable right away. Every
stream request is sent with `queue=false`, so a stream add-on never starts a
download; a track with nothing playable shows "Not available right now" and is
skipped. Stream add-ons on protocol versions before 0.3.0 do not understand
`queue=false` and might start a download on any request, so they are not asked
at all: only an answer already in the cache is used.

Downloads are allowed only when the server sets `FREEBAND_ALLOW_DOWNLOADS=true`
and the user turns on "Download tracks that aren't ready yet" in Settings (the
setting is greyed out otherwise). A client request can never allow more than
that.

Prefetch looks up streams for the whole upcoming queue, up to
`FREEBAND_PREFETCH_LIMIT` tracks, always with `queue=false`. With downloads
allowed, the first `FREEBAND_PREFETCH_QUEUE_AHEAD` tracks may start a download
instead, and older stream add-ons are asked only for those tracks.

## Database and migrations

SQLite is the default and the only database supported out of the box. Set
`DATABASE_URL=sqlite:/path/to/freeband.db`. Queries and migrations use only
portable Kysely; to use another database, add its dialect in
`server/db/index.ts`.

```
just migrate          # apply all pending migrations (also done at start-up)
just migrate down     # undo the last one
```

To add a migration, create `server/db/migrations/NNNN_name.ts` exporting
`up(db)` and `down(db)`, list it in `server/db/migrate.ts`, and update the
types in `server/db/schema.ts`.

## Security

- Add-on URLs can hold a user's credentials, so they are stored encrypted
  with `FREEBAND_SECRET_KEY`. Keep the key safe and back it up: if it is lost
  or changed, stored add-ons can no longer be read and users must install
  them again.
- Serve Freeband over HTTPS. Behind a reverse proxy, set
  `FREEBAND_TRUST_PROXY=true` so client addresses (used for sign-in rate
  limiting) and HTTPS detection (used for secure cookies) are correct.
- The server fetches add-on URLs that users enter. Add-ons on the local
  network are allowed by default, since self-hosted add-ons often run there.
  On a shared instance, restrict sign-up and turn on "Block add-ons on
  private networks" on the Admin screen: add-ons whose host resolves to a
  loopback, private, link-local, carrier-grade NAT or unspecified address are
  then refused at install time and before every request, redirects included.
  Answers cached before the switch was turned on are still served until they
  expire (clear the cache to drop them).

## Protocol and add-ons

The app talks to add-ons only through the protocol defined in
<https://github.com/freeband-music/protocol>, which also explains how the
whole system fits together and how to write an add-on.

`src/protocol/schema.gen.ts` is generated from that repository's
`openapi.yaml`; do not edit it. To regenerate it:

```
just gen                                     # reads ../protocol
FREEBAND_PROTOCOL=/path/to/protocol just gen
```

An example metadata add-on is at <https://github.com/freeband-music/addon-musicbrainz>.

## Responsibility

The protocol and the client are content-neutral: they contain no content and
name no source. Add-ons are independent software run by their operators.
Users are responsible for which add-ons they install, and for complying with
the law and with the terms of any service an add-on uses.

## Licence

GNU General Public License v3.0 or later (GPL-3.0-or-later). See `LICENSE`.
