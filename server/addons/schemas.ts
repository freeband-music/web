import { z } from "zod";

// Request validation for protocol objects the client sends back. Unknown
// fields are kept, as the protocol allows them.

const artist = z.looseObject({ id: z.string().min(1).max(512), name: z.string().max(1000) });

const album = z.looseObject({
  id: z.string().min(1).max(512),
  title: z.string().max(1000),
  artists: z.array(artist).max(50),
  year: z.number().int().optional(),
  trackCount: z.number().int().optional(),
  cover: z.string().max(4096).optional(),
});

export const trackSummarySchema = z.looseObject({
  id: z.string().min(1).max(512),
  title: z.string().min(1).max(1000),
  artists: z.array(artist).min(1).max(50),
  album: album.optional(),
  trackNumber: z.string().max(32).optional(),
  discNumber: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  isrc: z.string().max(32).optional(),
});
