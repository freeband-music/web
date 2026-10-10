import { expect, test } from "vitest";
import { sessionCookie, testApp } from "../testing";

test("sign up, log in, me, log out; first user is admin; closed sign-up rejects", async () => {
  const app = await testApp({ signup: "closed" });
  const post = (url: string, payload?: object, cookie?: string) =>
    app.inject({ method: "POST", url, payload, headers: { "x-requested-with": "freeband", ...(cookie ? { cookie } : {}) } });

  // The first user may sign up even when sign-up is closed, and becomes admin.
  const first = await post("/api/auth/signup", { username: "Alice", password: "password-1" });
  expect(first.statusCode).toBe(200);
  expect(first.json().user).toMatchObject({ username: "Alice", isAdmin: true });

  expect((await post("/api/auth/signup", { username: "bob", password: "password-2" })).json().error.code).toBe(
    "signup_closed",
  );

  // Open sign-up via the admin setting; the second user is not an admin.
  const admin = sessionCookie(first);
  const put = await app.inject({
    method: "PUT",
    url: "/api/admin/settings",
    payload: { signup: "open" },
    headers: { cookie: admin },
  });
  expect(put.statusCode).toBe(200);
  const second = await post("/api/auth/signup", { username: "bob", password: "password-2" });
  expect(second.json().user.isAdmin).toBe(false);
  expect((await post("/api/auth/signup", { username: "BOB", password: "password-3" })).statusCode).toBe(409);

  expect((await post("/api/auth/login", { username: "alice", password: "nope-nope" })).statusCode).toBe(401);
  const login = await post("/api/auth/login", { username: "alice", password: "password-1" });
  expect(login.statusCode).toBe(200);
  const cookie = sessionCookie(login);

  const me = await app.inject({ url: "/api/auth/me", headers: { cookie } });
  expect(me.json().user.username).toBe("Alice");

  expect((await post("/api/auth/logout", undefined, cookie)).statusCode).toBe(204);
  expect((await app.inject({ url: "/api/auth/me", headers: { cookie } })).statusCode).toBe(401);
  await app.close();
});
