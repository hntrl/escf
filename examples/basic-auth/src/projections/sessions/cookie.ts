import { TimeSpan } from "oslo";
import { CookieController } from "oslo/cookie";

export const sessionExpiresIn = new TimeSpan(30, "d");

export const sessionCookieController = new CookieController(
  "auth_session",
  {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  },
  {
    expiresIn: sessionExpiresIn,
  }
);
