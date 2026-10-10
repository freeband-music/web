import { z } from "zod";
import type { AlbumSnapshot, ArtistSnapshot, TrackSnapshot } from "../../shared/api";
import { trackSummarySchema } from "../addons/schemas";

/** Largest stored snapshot, as JSON. */
const MAX_SNAPSHOT = 16 * 1024;
const fits = (value: unknown) => JSON.stringify(value).length <= MAX_SNAPSHOT;
const origin = { addonBaseUrl: z.string().max(4096).optional() };
const artist = z.looseObject({
  id: z.string().min(1).max(512),
  name: z.string().max(1000),
  image: z.string().max(4096).optional(),
});

export const trackSnapshotSchema = trackSummarySchema
  .extend(origin)
  .refine(fits, "Track details are too large") as unknown as z.ZodType<TrackSnapshot>;

export const albumSnapshotSchema = z
  .looseObject({
    id: z.string().min(1).max(512),
    title: z.string().max(1000),
    artists: z.array(artist).max(50),
    year: z.number().int().optional(),
    trackCount: z.number().int().optional(),
    cover: z.string().max(4096).optional(),
    ...origin,
  })
  .refine(fits, "Album details are too large") as unknown as z.ZodType<AlbumSnapshot>;

export const artistSnapshotSchema = artist
  .extend(origin)
  .refine(fits, "Artist details are too large") as unknown as z.ZodType<ArtistSnapshot>;

export const fromJson = <T>(json: string): T => JSON.parse(json) as T;
