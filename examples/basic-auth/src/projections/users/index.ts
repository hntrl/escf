import { RpcTarget } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { ESCF, RequestError } from "escf/src";
import { drizzle } from "drizzle-orm/d1";
import { User } from "../../aggregates/user";
import { aggregates, system } from "../../system";
import { Session } from "../sessions";

import * as schema from "./schema";

const { users } = schema;

const bindings = ESCF.bindings((env: Env) => ({
  db: drizzle(env.DATABASE, { schema }),
  validateSession: (sessionId: string) =>
    system.getProjection(env, "sessions").validateSession(sessionId),
  env,
}));

export const UserService = ESCF.projection(aggregates, bindings, {
  name: "UserService",
  eventHandlers: ({ db }) => ({
    UserCreated({ aggregateId, timestamp, payload }) {
      return db.insert(users).values({
        ...payload,
        userId: aggregateId,
        createdAt: timestamp,
      });
    },
    UserUpdated({ aggregateId, payload }) {
      return db.update(users).set(payload).where(eq(users.userId, aggregateId));
    },
    UserDeleted({ aggregateId }) {
      return db.delete(users).where(eq(users.userId, aggregateId));
    },
  }),
  methods: ({ db, validateSession, env }) => {
    const ensureUniqueEmail = async (email: string) => {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .get();
      if (user) throw new RequestError("Email already in use");
    };
    return {
      /**
       * Registers a new user with the provided email, password, and user details
       * @param input - Object containing password and user creation details
       * @returns Promise resolving to the created user ID
       * @throws {RequestError} If email is already in use
       */
      async register(input: User & { password: string }) {
        await ensureUniqueEmail(input.email);
        return await system
          .getAggregate(env, "user")
          .executeSync("CreateUser", input);
      },

      /**
       * Authenticates a user with email and password
       * @param email - User's email address
       * @param password - User's password
       * @returns Promise resolving to the user ID if authentication successful
       * @throws {RequestError} If email/password combination is invalid
       */
      async authenticate(email: string, password: string) {
        const user = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .get();
        if (!user) throw new RequestError("Invalid email or password");
        await system
          .getAggregate(env, "user", user.userId)
          .executeSync("Authenticate", password)
          .catch(() => {
            throw new RequestError("Invalid email or password");
          });
        return user.userId;
      },
      async userSession(sessionId: string) {
        const session = await getSession(sessionId);
        return new UserSession(env, session, ensureUniqueEmail);
      },
    };
  },
});

export class UserSession extends RpcTarget {
  constructor(
    public env: Env,
    public session: Session,
    public ensureUniqueEmail: (email: string) => Promise<void>
  ) {
    super();
    this.env = env;
    this.session = session;
    this.ensureUniqueEmail = ensureUniqueEmail;
  }

  async update(input: User) {
    const user = await this.session.user;
    if (user.email !== input.email) {
      await this.ensureUniqueEmail(input.email);
    }
    system
      .getAggregate(this.env, "user", user.userId)
      .executeSync("UpdateUser", input);
  }

  async delete() {
    const user = await this.session.user;
    system
      .getAggregate(this.env, "user", user.userId)
      .executeSync("DeleteUser", null);
  }
}
