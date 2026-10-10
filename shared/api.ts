// Request and response types of the Freeband server HTTP API (`/api`).
// Shared by the client and the server.

export type SignupMode = "open" | "invite" | "closed";

/** Every error response has this shape. */
export interface ApiError {
  error: { code: string; message: string };
}

/** Mutating requests must send this header (or a JSON body). */
export const CSRF_HEADER = "X-Requested-With";
export const CSRF_VALUE = "freeband";

export interface UserInfo {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

export interface SignupRequest {
  username: string;
  password: string;
  displayName?: string;
  invite?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

/** Response of signup, login and `GET auth/me`. */
export interface MeResponse {
  user: UserInfo;
}

export interface AuthConfigResponse {
  signup: SignupMode;
  hasUsers: boolean;
}

export interface ChangePasswordRequest {
  current: string;
  new: string;
}

export interface SessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  current: boolean;
}

export interface SessionsResponse {
  sessions: SessionInfo[];
}

export interface UpdateProfileRequest {
  displayName: string;
}

export interface UsersResponse {
  users: UserInfo[];
}

export interface AdminSetPasswordRequest {
  password: string;
}

export interface ServerSettings {
  signup: SignupMode;
}

export interface InviteInfo {
  code: string;
  createdBy: string | null;
  createdAt: string;
  usedBy: string | null;
  usedAt: string | null;
}

export interface InvitesResponse {
  invites: InviteInfo[];
}

export interface InviteResponse {
  invite: InviteInfo;
}
