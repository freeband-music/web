import { useAuth } from "../store/auth";

export function AccountScreen() {
  const user = useAuth((s) => s.user);
  return (
    <div className="screen">
      <h1>Account</h1>
      {user && (
        <p>
          Signed in as <strong>{user.displayName}</strong> <span className="muted">({user.username})</span>
          {user.isAdmin && <span className="badge"> Admin</span>}
        </p>
      )}
      <button className="button" onClick={() => void useAuth.getState().logout()}>
        Sign out
      </button>
    </div>
  );
}
