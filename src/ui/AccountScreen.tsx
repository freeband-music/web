import { useState, type FormEvent } from "react";
import type { SessionInfo } from "../../shared/api";
import { account, errorMessage } from "../api/client";
import { useAuth } from "../store/auth";
import { useAsync } from "./common";
import { describeUserAgent, formatDate, timeAgo } from "./format";
import { confirmDialog, toast } from "./overlays";
import { links } from "./router";

export const MIN_PASSWORD = 8;

function ProfileForm() {
  const user = useAuth((s) => s.user);
  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const changed = name.trim() !== "" && name.trim() !== user.displayName;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!changed) return;
    setBusy(true);
    try {
      const response = await account.updateProfile(name.trim());
      useAuth.getState().setUser(response.user);
      setName(response.user.displayName);
      toast("Display name saved");
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="settings-card" onSubmit={(event) => void submit(event)}>
      <h2>Profile</h2>
      <p className="muted">
        Username <strong>{user.username}</strong> · member since {formatDate(user.createdAt)} ·{" "}
        <a href={links.user(user.username)}>View profile</a>
      </p>
      <label className="field">
        <span>Display name</span>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength={64} autoComplete="nickname" />
      </label>
      <div className="form-actions">
        <button className="button primary" disabled={busy || !changed}>
          Save
        </button>
      </div>
    </form>
  );
}

function PasswordForm({ onChanged }: { onChanged(): void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    if (next.length < MIN_PASSWORD) return setError(`The new password needs at least ${MIN_PASSWORD} characters.`);
    if (next !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    try {
      await account.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast("Password changed. Your other sessions were signed out.");
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="settings-card" onSubmit={(event) => void submit(event)}>
      <h2>Change password</h2>
      <label className="field">
        <span>Current password</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="field">
        <span>New password</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      </label>
      {error && <p className="status error">{error}</p>}
      <div className="form-actions">
        <button className="button primary" disabled={busy || !current || !next || !confirm}>
          Change password
        </button>
      </div>
    </form>
  );
}

function Sessions({ version, onChange }: { version: number; onChange(): void }) {
  const sessions = useAsync(() => account.sessions(), `sessions-${version}`);
  if (sessions.loading) return <p className="muted">Loading sessions…</p>;
  if ("error" in sessions) return <p className="status error">{sessions.error}</p>;
  const list = [...sessions.data.sessions].sort((a, b) => Number(b.current) - Number(a.current) || b.lastSeenAt.localeCompare(a.lastSeenAt));
  const others = list.filter((s) => !s.current);

  const revoke = async (session: SessionInfo) => {
    try {
      await account.revokeSession(session.id);
      toast("Session signed out");
      onChange();
    } catch (error) {
      toast(errorMessage(error));
    }
  };
  const revokeOthers = async () => {
    const ok = await confirmDialog({
      title: "Sign out everywhere else?",
      message: `This signs out ${others.length === 1 ? "1 other session" : `${others.length} other sessions`}.`,
      confirmLabel: "Sign out",
      danger: true,
    });
    if (!ok) return;
    try {
      await Promise.all(others.map((s) => account.revokeSession(s.id)));
      toast("Signed out everywhere else");
    } catch (error) {
      toast(errorMessage(error));
    }
    onChange();
  };

  return (
    <section className="settings-card">
      <h2>Sessions</h2>
      <p className="muted">Devices signed in to your account.</p>
      <ul className="admin-list">
        {list.map((session) => (
          <li key={session.id}>
            <span className="admin-list-text">
              <strong>{describeUserAgent(session.userAgent)}</strong>
              {session.current && <span className="pill">This device</span>}
              <span className="muted small">
                Last active {session.current ? "now" : timeAgo(session.lastSeenAt)} · signed in {formatDate(session.createdAt)}
              </span>
            </span>
            {session.current ? (
              <button className="button small" onClick={() => void useAuth.getState().logout()}>
                Sign out
              </button>
            ) : (
              <button className="button small" onClick={() => void revoke(session)}>
                Sign out
              </button>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <div className="form-actions">
          <button className="button outline" onClick={() => void revokeOthers()}>
            Sign out everywhere else
          </button>
        </div>
      )}
    </section>
  );
}

export function AccountScreen() {
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  return (
    <div className="screen narrow">
      <h1>Account</h1>
      <ProfileForm />
      <PasswordForm onChanged={refresh} />
      <Sessions version={version} onChange={refresh} />
    </div>
  );
}
