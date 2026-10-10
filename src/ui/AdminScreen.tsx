import { useState, type FormEvent } from "react";
import type { InviteInfo, SignupMode, UserInfo } from "../../shared/api";
import { admin, errorMessage } from "../api/client";
import { useAuth } from "../store/auth";
import { MIN_PASSWORD } from "./AccountScreen";
import { copyText, useAsync } from "./common";
import { formatDate, timeAgo } from "./format";
import { confirmDialog, Modal, toast } from "./overlays";
import { links } from "./router";

const MODES: { value: SignupMode; label: string; hint: string }[] = [
  { value: "open", label: "Open", hint: "Anyone who can reach this server can create an account." },
  { value: "invite", label: "Invite only", hint: "New accounts need an invite code." },
  { value: "closed", label: "Closed", hint: "Nobody can sign up." },
];

function SignupSettings() {
  const settings = useAsync(() => admin.settings(), "admin-settings");
  const [mode, setMode] = useState<SignupMode>();
  if (settings.loading) return <p className="muted">Loading…</p>;
  if ("error" in settings) return <p className="status error">{settings.error}</p>;
  const shown = mode ?? settings.data.signup;
  const choose = async (value: SignupMode) => {
    const before = shown;
    setMode(value);
    try {
      await admin.updateSettings({ signup: value });
      toast("Sign-up setting saved");
    } catch (error) {
      setMode(before);
      toast(errorMessage(error));
    }
  };
  return (
    <section className="settings-card">
      <h2>Sign-up</h2>
      <fieldset className="segmented" aria-label="Sign-up">
        {MODES.map((m) => (
          <label key={m.value} className={shown === m.value ? "active" : undefined}>
            <input type="radio" name="signup" checked={shown === m.value} onChange={() => void choose(m.value)} />
            {m.label}
          </label>
        ))}
      </fieldset>
      <p className="muted small">{MODES.find((m) => m.value === shown)?.hint}</p>
    </section>
  );
}

function Invites({ names }: { names: Map<string, string> }) {
  const [version, setVersion] = useState(0);
  const invites = useAsync(() => admin.invites(), `invites-${version}`);
  const refresh = () => setVersion((v) => v + 1);
  const create = async () => {
    try {
      const { invite } = await admin.createInvite();
      refresh();
      await copyText(invite.code, "Invite created and copied");
    } catch (error) {
      toast(errorMessage(error));
    }
  };
  const remove = async (invite: InviteInfo) => {
    try {
      await admin.deleteInvite(invite.code);
      toast("Invite deleted");
      refresh();
    } catch (error) {
      toast(errorMessage(error));
    }
  };
  const list = invites.loading || "error" in invites ? [] : invites.data.invites;
  const sorted = [...list].sort((a, b) => Number(a.usedAt !== null) - Number(b.usedAt !== null) || b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="settings-card">
      <div className="title-row">
        <h2>Invites</h2>
        <button className="button small primary" onClick={() => void create()}>
          Create invite
        </button>
      </div>
      <p className="muted small">Share a code with someone; it works once, when sign-up is set to invite only.</p>
      {"error" in invites && <p className="status error">{invites.error}</p>}
      {!invites.loading && sorted.length === 0 && <p className="muted">No invites yet.</p>}
      <ul className="admin-list">
        {sorted.map((invite) => (
          <li key={invite.code}>
            <span className="admin-list-text">
              <code className="code">{invite.code}</code>
              <span className="muted small">
                {invite.usedAt
                  ? `Used by ${names.get(invite.usedBy ?? "") ?? "a deleted user"} ${timeAgo(invite.usedAt)}`
                  : `Unused · created ${timeAgo(invite.createdAt)}`}
              </span>
            </span>
            {!invite.usedAt && (
              <button className="button small" onClick={() => void copyText(invite.code, "Invite code copied")}>
                Copy
              </button>
            )}
            <button className="button small ghost" onClick={() => void remove(invite)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResetPassword({ user, onClose }: { user: UserInfo; onClose(): void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) return;
    setBusy(true);
    try {
      await admin.setPassword(user.id, password);
      toast(`Password reset for ${user.username}`);
      onClose();
    } catch (error) {
      toast(errorMessage(error));
      setBusy(false);
    }
  };
  return (
    <Modal title={`Reset password for ${user.username}`} onClose={onClose}>
      <form className="dialog-form" onSubmit={(event) => void submit(event)}>
        <p className="dialog-message">They will be signed out everywhere and need the new password to sign in.</p>
        <label className="field">
          <span>New password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
        </label>
        <p className="muted small">At least {MIN_PASSWORD} characters.</p>
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || password.length < MIN_PASSWORD}>
            Reset password
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Users({ users, onChange }: { users: UserInfo[]; onChange(): void }) {
  const me = useAuth((s) => s.user);
  const [resetting, setResetting] = useState<UserInfo>();
  const remove = async (user: UserInfo) => {
    const ok = await confirmDialog({
      title: `Delete ${user.username}?`,
      message: "Their playlists, library and history are deleted for good.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await admin.deleteUser(user.id);
      toast(`${user.username} deleted`);
      onChange();
    } catch (error) {
      toast(errorMessage(error));
    }
  };
  return (
    <section className="settings-card">
      <h2>Users</h2>
      <ul className="admin-list">
        {users.map((user) => (
          <li key={user.id}>
            <span className="admin-list-text">
              <strong>
                <a href={links.user(user.username)}>{user.displayName}</a>
              </strong>
              {user.isAdmin && <span className="pill">Admin</span>}
              {user.id === me?.id && <span className="pill">You</span>}
              <span className="muted small">
                {user.username} · joined {formatDate(user.createdAt)}
              </span>
            </span>
            {user.id !== me?.id && (
              <>
                <button className="button small" onClick={() => setResetting(user)}>
                  Reset password
                </button>
                <button className="button small ghost danger-text" onClick={() => void remove(user)}>
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(undefined)} />}
    </section>
  );
}

function Cache() {
  const [busy, setBusy] = useState(false);
  const clear = async () => {
    setBusy(true);
    try {
      await admin.clearCache();
      toast("Cache cleared");
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-card">
      <h2>Cache</h2>
      <p className="muted small">Add-on responses are cached on the server. Clearing makes every request go to the add-ons again.</p>
      <div className="form-actions">
        <button className="button outline" onClick={() => void clear()} disabled={busy}>
          Clear cache
        </button>
      </div>
    </section>
  );
}

export function AdminScreen() {
  const isAdmin = useAuth((s) => s.user?.isAdmin === true);
  const [version, setVersion] = useState(0);
  const users = useAsync(() => admin.users(), `users-${version}`);
  if (!isAdmin) return <p className="screen muted">Only admins can open this page.</p>;
  const list = users.loading || "error" in users ? [] : users.data.users;
  const names = new Map(list.map((u) => [u.id, u.username]));
  return (
    <div className="screen narrow">
      <h1>Admin</h1>
      <SignupSettings />
      <Invites names={names} />
      {"error" in users && <p className="status error">{users.error}</p>}
      {!users.loading && <Users users={list} onChange={() => setVersion((v) => v + 1)} />}
      <Cache />
    </div>
  );
}
