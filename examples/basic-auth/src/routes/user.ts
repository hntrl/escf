import { Hono } from "hono/quick";
import { parseCookies } from "oslo/cookie";
import { z } from "zod";

import { sessionCookieController } from "../projections/sessions/cookie";
import { zValidator } from "@hono/zod-validator";

import { system } from "../system";

type Variables = { sessionToken: string };

export const userRoutes = new Hono<{ Variables: Variables }>({
  strict: false,
})
  .use(async (c, next) => {
    const cookies = parseCookies(c.req.header("Cookie") ?? "");
    c.set("sessionToken", cookies.get("auth_session") ?? "");
    await next();
  })
  .get("/", async (c) => {
    const { user, session } = await system
      .getProjection(c.env, "sessions")
      .getSession(c.get("sessionToken"));
    if (session && session.fresh) {
      const sessionValue = sessionCookieController.createCookie(
        session.sessionId
      );
      c.header("Set-Cookie", sessionValue.serialize());
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
      c.header(
        "Set-Cookie",
        sessionCookieController.createCookie(session.sessionId).serialize()
      );
      return c.json({ session });
    }
  )
  .post("/logout", async (c) => {
    await system
      .getProjection(c.env, "sessions")
      .invalidateSession(c.get("sessionToken"));
    c.header(
      "Set-Cookie",
      sessionCookieController.createBlankCookie().serialize()
    );
    return c.body(null, 204);
  })
  .post(
    "/register",
    zValidator(
      "json",
      z.object({
        avatar: z.string().nullable(),
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
      c.header(
        "Set-Cookie",
        sessionCookieController.createCookie(session.sessionId).serialize()
      );
      return c.json({ session });
    }
  );
