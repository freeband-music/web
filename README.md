# Freeband web client

Freeband is an open-source music client in the style of add-on based media
centres. This repository is the client: a static web app (TypeScript, React,
Vite). It ships with no add-ons and no content. Everything it shows and plays
comes from add-ons the user installs.

An add-on is an HTTP server that speaks the
[Freeband add-on protocol](https://github.com/freeband-music/protocol).
Metadata add-ons provide search and artist, album and track information;
stream add-ons turn a track's details into playable URLs.

## Features

- Install add-ons by URL
- Search across the installed metadata add-ons
- Artist and album pages
- Play queue
- Player with seek
- Audio-quality setting
- Responsive layout for desktop and mobile

## Run

With Nix:

```
nix develop
pnpm install     # first time only
just dev         # http://localhost:5173, also reachable from the LAN
just check       # tests, type check and production build
```

Without Nix you need Node 22 and pnpm:

```
pnpm install
pnpm dev         # development server
pnpm test        # unit tests
pnpm build       # production build in dist/
```

The build in `dist/` is a set of static files that any web server can host.

## Install an add-on

1. Open the **Add-ons** screen.
2. Paste the add-on's URL, for example `https://example.org`, and install
   it. The client fetches `manifest.json` from that address.
3. Install at least one metadata add-on (to search and browse) and one stream
   add-on (to play).

Some add-ons need per-user settings. Those have a configure page that produces
a personal URL; paste that URL instead, and treat it as a secret if it holds
credentials. Installed add-ons are stored in the browser, and their manifests
are refetched when the app starts.

In development builds the Add-ons screen also offers shortcuts for add-ons
running on local ports.

## Protocol and add-ons

The client talks to add-ons only through the protocol defined in
<https://github.com/freeband-music/protocol>, which also explains how the
whole system fits together and how to write an add-on.

`src/protocol/schema.gen.ts` is generated from that repository's
`openapi.yaml`; do not edit it. To regenerate it:

```
just gen                                     # reads ../protocol
FREEBAND_PROTOCOL=/path/to/protocol just gen
```

An example metadata add-on is at <https://github.com/freeband-music/addon-musicbrainz>.

## Status

Early. The features above work in development, but the app has not yet been
systematically tested across browsers.

## Responsibility

The protocol and the client are content-neutral: they contain no content and
name no source. Add-ons are independent software run by their operators.
Users are responsible for which add-ons they install, and for complying with
the law and with the terms of any service an add-on uses.

## Licence

GNU General Public License v3.0 or later (GPL-3.0-or-later). See `LICENSE`.
