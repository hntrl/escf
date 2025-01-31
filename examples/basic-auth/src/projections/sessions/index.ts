import { RpcTarget } from "cloudflare:workers";
import { eq, InferSelectModel } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createDate } from "oslo";

import { ESCF, RequestError } from "escf/src";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { User } from "../../aggregates/user";
import { aggregates, system } from "../../system";
const { users, sessions } = schema;

const bindings = ESCF.bindings((env: Env) => ({
  db: drizzle(env.DATABASE, { schema }),
  env,
}));

export const SessionService = ESCF.projection(aggregates, bindings, {
  name: "SessionService",
  eventHandlers: ({ db }) => ({
    async UserCreated({ aggregateId, payload }) {
      await db.insert(users).values({
        userId: aggregateId,
        name: payload.name,
        email: payload.email,
      });
    },
    async UserDeleted({ aggregateId }) {
      await db.delete(users).where(eq(users.userId, aggregateId));
      await db.delete(sessions).where(eq(sessions.userId, aggregateId));
    },
  }),
  methods: ({ db, env }) => {
    const createSession = async (
      userObject: InferSelectModel<typeof users>
    ) => {
      const session = {
        sessionId: nanoid(),
        userId: userObject.userId,
        expiresAt: createDate(sessionExpiresIn),
      };
      await db.insert(sessions).values(session);
      return new Session(userObject, session, true);
    };
    const usersProjection = system.getProjection(env, "users");
    return {
      async register(input: User & { password: string }) {
        const userId = await usersProjection.register(input);
        const session = await createSession({ userId, ...input });
        return session;
      },
      async authenticate(email: string, password: string) {
        const userId = await usersProjection.authenticate(email, password);
        const user = await db
          .select()
          .from(users)
          .where(eq(users.userId, userId))
          .get();
        if (!user) throw new RequestError("Invalid credentials");
        const session = await createSession(user);
        return session;
      },
      async getSession(sessionId: string) {
        const session = await db
          .select()
          .from(sessions)
          .where(eq(sessions.sessionId, sessionId))
          .get();
        if (!session) throw new RequestError("Invalid session");
        const user = await db
          .select()
          .from(users)
          .where(eq(users.userId, session.userId))
          .get();
        if (!user) throw new RequestError("Invalid session");
        return new Session(user, session, false);
      },
      async invalidateSession(sessionId: string) {
        await db.delete(sessions).where(eq(sessions.sessionId, sessionId));
      },
    };
  },
});

export class Session extends RpcTarget {
  constructor(
    private userObject: InferSelectModel<typeof users>,
    private sessionObject: InferSelectModel<typeof sessions>,
    private fresh: boolean = false
  ) {
    super();
    this.userObject = userObject;
    this.sessionObject = sessionObject;
    this.fresh = fresh;
  }

  get user() {
    return this.userObject;
  }

  get session() {
    return {
      ...this.sessionObject,
      fresh: this.fresh,
    };
  }
}
