import type { QualityPreset } from "../resolver/resolver";
import { useSettings } from "../store/settings";

const QUALITY: { value: QualityPreset; label: string; hint: string }[] = [
  { value: "addon", label: "Add-on default", hint: "Keep the order each add-on suggests." },
  { value: "data-saver", label: "Data saver", hint: "Prefer compressed audio." },
  { value: "balanced", label: "Balanced", hint: "Prefer CD-quality lossless." },
  { value: "best", label: "Best", hint: "Prefer the highest resolution available." },
];

export function SettingsScreen() {
  const { quality, setQuality } = useSettings();
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
    </div>
  );
}
