import { create } from "zustand";
import type { AuthConfigResponse, SignupRequest, UserInfo } from "../../shared/api";
import { auth, setUnauthorizedHandler } from "../api/client";

export type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  user: UserInfo | null;
  /** Sign-up mode and whether any user exists; null until loaded. */
  config: AuthConfigResponse | null;
  /** The server could not be reached when the config was last asked for. */
  serverDown: boolean;
  /** Asks the server whether this browser is signed in. */
  init(): Promise<void>;
  login(username: string, password: string): Promise<void>;
  signup(request: SignupRequest): Promise<void>;
  logout(): Promise<void>;
  /** The session ended on the server (a request answered 401). */
  signedOut(): void;
  /** Updates the shown user after a profile change. */
  setUser(user: UserInfo): void;
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: "loading",
  user: null,
  config: null,
  serverDown: false,
  async init() {
    try {
      const { user } = await auth.me();
      set({ status: "signedIn", user });
    } catch {
      await loadConfig();
      set({ status: "signedOut", user: null });
    }
  },
  async login(username, password) {
    const { user } = await auth.login({ username, password });
    set({ status: "signedIn", user });
  },
  async signup(request) {
    const { user } = await auth.signup(request);
    set({ status: "signedIn", user });
  },
  async logout() {
    try {
      await auth.logout();
    } finally {
      get().signedOut();
    }
  },
  signedOut() {
    if (get().status === "signedOut") return;
    set({ status: "signedOut", user: null });
    void loadConfig();
  },
  setUser: (user) => set({ user }),
}));

async function loadConfig() {
  try {
    useAuth.setState({ config: await auth.config(), serverDown: false });
  } catch {
    useAuth.setState({ serverDown: true });
  }
}

setUnauthorizedHandler(() => useAuth.getState().signedOut());
