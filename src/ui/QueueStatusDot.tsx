import type { QueueTrackStatus, Stream } from "../../shared/api";

/** "FLAC 24/96", "MP3 320". */
export function qualityLabel(quality: Stream["quality"]): string {
  const codec = quality.codec.toUpperCase();
  if (quality.lossless && quality.bitDepth && quality.sampleRateHz) {
    return `${codec} ${quality.bitDepth}/${Math.round(quality.sampleRateHz / 100) / 10}`;
  }
  return quality.bitrateKbps ? `${codec} ${quality.bitrateKbps}` : codec;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** The tooltip for a status. */
export function describeStatus(status: QueueTrackStatus | undefined): string {
  switch (status?.state) {
    case undefined:
    case "unchecked":
      return "Not checked yet";
    case "checking":
      return "Checking…";
    case "ready": {
      const parts = ["Ready"];
      if (status.quality) parts.push(qualityLabel(status.quality));
      if (status.expiresAt) parts.push(`until ${time(status.expiresAt)}`);
      return parts.join(" · ");
    }
    case "unavailable":
      return `Not available right now; will be skipped${status.message ? ` (${status.message})` : ""}`;
    case "error":
      return `${status.addonName ? `${status.addonName}: ` : ""}${status.message ?? "The lookup failed"}. Click to try again.`;
    case "expired":
      return "Expired; checking again";
  }
}

/** A small shape-and-colour status mark; an error is a button that retries. */
export function QueueStatusDot({ status, onRetry }: { status: QueueTrackStatus | undefined; onRetry?(): void }) {
  const state = status?.state ?? "unchecked";
  const label = describeStatus(status);
  if (state === "error" && onRetry) {
    return (
      <button
        type="button"
        className="qdot error"
        title={label}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          onRetry();
        }}
      />
    );
  }
  return <span className={`qdot ${state}`} title={label} role="img" aria-label={label} />;
}
