import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../api/client";
import { useAuth } from "../store/auth";

export function AuthScreen() {
  const config = useAuth((s) => s.config);
  const serverDown = useAuth((s) => s.serverDown);
  const firstRun = config?.hasUsers === false;
  const canSignUp = firstRun || (config !== null && config.signup !== "closed");
  const needsInvite = !firstRun && config?.signup === "invite";
  const [mode, setMode] = useState<"login" | "signup">(firstRun ? "signup" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const signingUp = mode === "signup" && canSignUp;
  useEffect(() => {
    if (firstRun) setMode("signup");
  }, [firstRun]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const { login, signup } = useAuth.getState();
      if (signingUp) await signup({ username, password, invite: needsInvite ? invite.trim() : undefined });
      else await login(username, password);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <form className="form" onSubmit={submit}>
        <h1>Freeband</h1>
        {serverDown && (
          <p className="status error">
            Could not reach the server.{" "}
            <button type="button" className="link-button" onClick={() => void useAuth.getState().init()}>
              Try again
            </button>
          </p>
        )}
        {firstRun && <p className="muted">Welcome. Create the first account; it becomes the administrator.</p>}
        <h2>{signingUp ? "Create an account" : "Sign in"}</h2>
        <label>
          Username
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={signingUp ? 8 : undefined}
            required
          />
        </label>
        {signingUp && needsInvite && (
          <label>
            Invite code
            <input type="text" value={invite} onChange={(e) => setInvite(e.target.value)} required />
          </label>
        )}
        {error && <p className="status error">{error}</p>}
        <button className="button primary" disabled={busy}>
          {signingUp ? "Create account" : "Sign in"}
        </button>
        {canSignUp && !firstRun && (
          <p className="muted">
            {signingUp ? "Already have an account? " : "New here? "}
            <button type="button" className="link-button" onClick={() => setMode(signingUp ? "login" : "signup")}>
              {signingUp ? "Sign in" : "Create an account"}
            </button>
          </p>
        )}
      </form>
    </div>
  );
}
