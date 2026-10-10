import type { QualityPreset } from "../resolver/resolver";
import { useAuth } from "../store/auth";
import { useSettings } from "../store/settings";

const QUALITY: { value: QualityPreset; label: string; hint: string }[] = [
  { value: "addon", label: "Add-on default", hint: "Keep the order each add-on suggests." },
  { value: "data-saver", label: "Data saver", hint: "Prefer compressed audio." },
  { value: "balanced", label: "Balanced", hint: "Prefer CD-quality lossless." },
  { value: "best", label: "Best", hint: "Prefer the highest resolution available." },
];

export function SettingsScreen() {
  const { quality, setQuality, allowDownloads, setAllowDownloads } = useSettings();
  const serverAllowsDownloads = useAuth((s) => s.config?.allowDownloads === true);
  return (
    <div className="screen">
      <h1>Settings</h1>
      <fieldset className="options">
        <legend>Audio quality</legend>
        {QUALITY.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name="quality"
              checked={quality === option.value}
              onChange={() => setQuality(option.value)}
            />
            <span>
              {option.label}
              <span className="muted"> · {option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="muted">A better-matching source always comes before a higher-quality one.</p>
      <fieldset className="options">
        <legend>Playback</legend>
        <label className={serverAllowsDownloads ? undefined : "disabled"}>
          <input
            type="checkbox"
            disabled={!serverAllowsDownloads}
            checked={serverAllowsDownloads && allowDownloads}
            onChange={(event) => setAllowDownloads(event.target.checked)}
          />
          <span>
            Download tracks that aren't ready yet
            <span className="muted">
              {" · "}
              {serverAllowsDownloads
                ? "A stream add-on may start a download; the track plays once it is ready."
                : "Not available yet"}
            </span>
          </span>
        </label>
      </fieldset>
    </div>
  );
}
