import { HTTPException } from "hono/http-exception";
import { Hono } from "hono/quick";
import { StatusCode } from "hono/utils/http-status";

import { userRoutes } from "./routes/user";
import { castRpcError, RequestError } from "escf/rpc";
import { sessionCookieController } from "./projections/sessions/cookie";

import index from "./routes/index";

export const api = new Hono({ strict: false })
  .options("*", (c) => c.body(null, 204))
  .notFound((c) => c.json({ message: "Route not found" }, 404))
  .onError((err, c) => {
    err = castRpcError(err);
    if (err instanceof RequestError) {
      if (err.status === 419) {
        c.header(
          "Set-Cookie",
          sessionCookieController.createBlankCookie().serialize()
        );
      }
      err = new HTTPException(err.status as StatusCode, err);
    }
    if (err instanceof HTTPException) {
      return err.getResponse();
    }
    throw err;
  })
  .get("/", async (c) => c.html(index))
  .route("/v1/user", userRoutes);

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return api.fetch(request, env, ctx);
  },
};

export { UserAggregate } from "./aggregates/user";
