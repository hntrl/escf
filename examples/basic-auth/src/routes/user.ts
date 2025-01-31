import { Hono } from "hono/quick";
import { z } from "zod";

import { zValidator } from "@hono/zod-validator";

import { system } from "../system";

import cookie from "cookie";

type Variables = { sessionToken: string };

const SESSION_KEY = "__session";

function serializeSessionCookie(sessionId: string) {
  return cookie.serialize(SESSION_KEY, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export const userRoutes = new Hono<{ Variables: Variables }>({
  strict: false,
})
  .use(async (c, next) => {
    const cookies = cookie.parse(c.req.header("Cookie") ?? "");
    c.set("sessionToken", cookies[SESSION_KEY] ?? "");
    await next();
  })
  .get("/", async (c) => {
    const { user, session } = await system
      .getProjection(c.env, "sessions")
      .validateSession(c.get("sessionToken"));
    if (session && session.fresh) {
      c.header("Set-Cookie", serializeSessionCookie(session.sessionId));
    }
    return c.json({ user, session });
  })
  .post(
    "/login",
    zValidator(
      "json",
      z.object({
        email: z.string(),
        password: z.string(),
      })
    ),
    async (c) => {
      const { email, password } = c.req.valid("json");
      const { session } = await system
        .getProjection(c.env, "sessions")
        .authenticate(email, password);
      c.header("Set-Cookie", serializeSessionCookie(session.sessionId));
      return c.json({ session });
    }
  )
  .post("/logout", async (c) => {
    await system
      .getProjection(c.env, "sessions")
      .invalidateSession(c.get("sessionToken"));
    c.header("Set-Cookie", serializeSessionCookie(""));
    return c.body(null, 204);
  })
  .post(
    "/register",
    zValidator(
      "json",
      z.object({
        name: z.string(),
        email: z.string(),
        password: z.string(),
      })
    ),
    async (c) => {
      const input = c.req.valid("json");
      const { session } = await system
        .getProjection(c.env, "sessions")
        .register(input);
      c.header("Set-Cookie", serializeSessionCookie(session.sessionId));
      return c.json({ session });
    }
  );
