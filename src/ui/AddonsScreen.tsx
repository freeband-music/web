import { useEffect, useState, type FormEvent } from "react";
import type { AddonFailure } from "../../shared/api";
import { errorMessage } from "../api/client";
import { useAddons } from "../store/addons";
import { IconButton } from "./common";

const DEV_ADDON_PORTS = [7003, 7001];
const DEV_STREAM_CONFIGURE_URL = "http://localhost:7002/configure";

/** The short status shown next to an add-on whose manifest could not be refreshed. */
export function failureLabel(failure: AddonFailure): string {
  switch (failure.code) {
    case "unsupported_protocol":
      return `Unsupported protocol version ${failure.protocolVersion ?? ""}`.trim();
    case "blocked":
      return "Blocked (private network)";
    case "unreachable":
      return "Offline";
    default:
      return "Not working";
  }
}

export function AddonsScreen() {
  const { addons, errors, install, remove, move, setEnabled, refresh } = useAddons();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Check every add-on again whenever the screen opens.
  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const installFrom = (target: string) =>
    run(async () => {
      await install(target);
      setUrl("");
    });

  function submit(event: FormEvent) {
    event.preventDefault();
    void installFrom(url);
  }

  return (
    <div className="screen">
      <h1>Add-ons</h1>
      <p className="muted">
        Add-ons provide search, album and artist details, and streams. Paste an add-on's URL to install it; it is stored
        with your account. Add-ons higher in the list are asked first.
      </p>
      <form className="install" onSubmit={submit}>
        <input
          type="url"
          placeholder="https://example.org/manifest.json"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label="Add-on URL"
        />
        <button className="button primary" disabled={busy || !url.trim()}>
          {busy ? "Installing…" : "Install"}
        </button>
      </form>
      {error && <p className="status error">{error}</p>}

      {import.meta.env.DEV && (
        <p className="dev-tools">
          {DEV_ADDON_PORTS.map((port) => (
            <button
              key={port}
              className="button"
              onClick={() => void installFrom(`http://localhost:${port}`)}
              disabled={busy}
            >
              Add local metadata add-on (port {port})
            </button>
          ))}
          <a href={DEV_STREAM_CONFIGURE_URL} target="_blank" rel="noreferrer">
            Configure local stream add-on
          </a>
        </p>
      )}

      {addons.length === 0 && <p className="muted">No add-ons installed yet.</p>}
      <ul className="addons">
        {addons.map((addon, index) => {
          const failure = errors.find((e) => e.addonId === addon.id);
          return (
            <li key={addon.id}>
              <input
                type="checkbox"
                checked={addon.enabled}
                onChange={(event) => void run(() => setEnabled(addon.id, event.target.checked))}
                aria-label={addon.enabled ? "Disable" : "Enable"}
                title={addon.enabled ? "Enabled" : "Disabled"}
              />
              <div className="addon-text">
                <strong>{addon.manifest.name}</strong> <span className="muted">v{addon.manifest.version}</span>
                {!addon.enabled && <span className="badge">Disabled</span>}
                {failure && <span className="badge warn">{failureLabel(failure)}</span>}
                {addon.manifest.description && <p>{addon.manifest.description}</p>}
                {failure && <p className="status error">{failure.message}</p>}
                <p className="muted">
                  {addon.manifest.resources.join(", ")} · {addon.baseUrl}
                </p>
                {addon.manifest.configurable && (
                  <a href={`${addon.baseUrl}/configure`} target="_blank" rel="noreferrer">
                    Configure
                  </a>
                )}
              </div>
              <span className="track-actions">
                <IconButton
                  icon="up"
                  label="Move up"
                  onClick={() => void run(() => move(index, -1))}
                  disabled={busy || index === 0}
                />
                <IconButton
                  icon="down"
                  label="Move down"
                  onClick={() => void run(() => move(index, 1))}
                  disabled={busy || index === addons.length - 1}
                />
                <IconButton icon="remove" label="Remove" onClick={() => void run(() => remove(addon.id))} disabled={busy} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
