import { RpcTarget } from "cloudflare:workers";
import { eq, InferSelectModel } from "drizzle-orm";
import { nanoid } from "nanoid";

import { ESCF, RequestError } from "escf/src";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import { User } from "../../aggregates/user";
import { aggregates, system } from "../../system";
import { Duration, isWithinDuration } from "../../utils/date";

const { users, sessions } = schema;

const sessionDuration = new Duration(30, "d");

const bindings = ESCF.bindings((env: Env) => ({
  db: drizzle(env.DATABASE, { schema }),
  env,
}));

type SessionUser = InferSelectModel<typeof users> & {};

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
    async UserUpdated({ aggregateId, payload }) {
      await db.update(users).set(payload).where(eq(users.userId, aggregateId));
    },
    async UserDeleted({ aggregateId }) {
      await db.delete(users).where(eq(users.userId, aggregateId));
      await db.delete(sessions).where(eq(sessions.userId, aggregateId));
    },
  }),
  methods: ({ db, env }) => {
    const createSession = async (userObject: SessionUser) => {
      const session = {
        sessionId: nanoid(),
        userId: userObject.userId,
        expiresAt: Date.now() + sessionDuration.milliseconds(),
      };
      await db.insert(sessions).values(session);
      return new Session(userObject, session, true);
    };
    const getSessionUser = async (userId: string) => {
      return await db
        .select()
        .from(users)
        .where(eq(users.userId, userId))
        .get();
    };
    const usersProjection = system.getProjection(env, "users");
    return {
      /**
       * Registers a new user and creates a session for them
       * @param input - User registration data including password
       * @param input.password - The user's password
       * @returns {Promise<Session>} A new session object for the registered user
       */
      async register(input: User & { password: string }) {
        const userId = await usersProjection.register(input);
        const session = await createSession({ userId, ...input });
        return session;
      },

      /**
       * Authenticates a user with their email and password
       * @param email - The user's email address
       * @param password - The user's password
       * @returns {Promise<Session>} A new session object for the authenticated user
       * @throws {RequestError} If the email/password combination is invalid
       */
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

      /**
       * Validate an existing session by its ID
       * @param sessionId - The unique identifier of the session
       * @returns {Promise<Session>} The session object if found
       * @throws {RequestError} If the session is invalid or the associated user doesn't exist
       */
      async validateSession(sessionId: string) {
        const session = await db
          .select()
          .from(sessions)
          .where(eq(sessions.sessionId, sessionId))
          .get();
        if (!session) throw new RequestError("Invalid session", 419);
        if (session.expiresAt <= new Date().getTime()) {
          await db.delete(sessions).where(eq(sessions.sessionId, sessionId));
          throw new RequestError("Invalid session", 419);
        }
        if (isWithinDuration(session.expiresAt, sessionDuration)) {
          session.expiresAt = Date.now() + sessionDuration.milliseconds();
          await db
            .update(sessions)
            .set({ expiresAt: session.expiresAt })
            .where(eq(sessions.sessionId, sessionId));
        }
        const user = await getSessionUser(session.userId);
        if (!user) throw new RequestError("Invalid session", 419);
        return new Session(user, session, false);
      },

      /**
       * Invalidates (deletes) an existing session
       * @param sessionId - The unique identifier of the session to invalidate
       * @returns {Promise<void>}
       */
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
