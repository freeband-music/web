import type { components } from "./protocol/schema.gen";

type Schemas = components["schemas"];

export type Manifest = Schemas["Manifest"];
export type Resource = Manifest["resources"][number];
export type ArtistSummary = Schemas["ArtistSummary"];
export type AlbumSummary = Schemas["AlbumSummary"];
export type TrackSummary = Schemas["TrackSummary"];
export type Artist = Schemas["Artist"];
export type Album = Schemas["Album"];
export type Track = Schemas["Track"];
export type SearchResponse = Schemas["SearchResponse"];
export type Quality = Schemas["Quality"];
export type Match = Schemas["Match"];
export type Stream = Schemas["Stream"];
export type StreamResponse = Schemas["StreamResponse"];
