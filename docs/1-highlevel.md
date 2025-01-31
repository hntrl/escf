# Project Overview

You are creating a library called ESCF (which stands for Event Sourced Cloudflare) that allows developers to build reactive, event-sourced applications on Cloudflare Workers. Everything should follow standard practices and be compliant with the technical and architectural guidelines of Cloudflare Workers.

* The library should provide a standard interface for defining aggregates, projections, and other system components.
* The library should provide a standard interface for defining commands, events, and the logic for handling them.
* The library should be completely type safe, and leverage the power of TypeScript to provide a seamless development experience. Commands, events, and the logic for handling them should all be type safe.

## API Implementation

I imagine the structure of a project that uses this library would have the following heuristics:

* An "entrypoint" that implmements a REST interface for interacting with the system is contained in its own worker. Attached to it are all of the DurableObject instances that are needed for the system to operate.
* Individual projections that represent the system's state are contained in their own independent workers. These workers "consume" events either from a standard Cloudflare events queue, or directly as a workers entrypoint.
* Individual workers should follow the same patterns as standard cloudflare implementations using independent (and separated) wrangler.toml files.
* The implementation of the REST interface should be able to call "execute" methods on the relevant aggregates.
* Mutations on aggregates should produce events that get persisted in a D1 EventStore, and then published to all of the projections' event queues.

## Example Implementation

aggregate.ts (contained under the root worker's scope)
```ts
const state = ESCF.aggregate.state(
  userSchema.merge(
    z.object({
      deleted: z.boolean(),
      passwordHash: z.string(),
      emailVerification: userEmailVerification.nullable(),
    })
  )
);

const events = ESCF.aggregate.events(state, (define) => ({
  UserCreated: define({
    schema: userSchema,
    reducer(event, state) {
      return { ...state, ...event, deleted: false };
    },
  }),
  UserUpdated: define({
    schema: userSchema,
    reducer(event, state) {
      return { ...state, ...event };
    },
  }),
  UserDeleted: define({
    schema: z.null(),
    reducer(_, state) {
      return { ...state, deleted: true };
    },
  }),
  UserAuthenticated: define({
    schema: z.null(),
    reducer(_, state) {
      return state;
    },
  }),
  UserEmailVerificationIssued: define({
    schema: z.object({
      token: z.string(),
      newEmail: z.string(),
      oldEmail: z.string().nullable(),
      expiresAt: z.number().nullable(),
    }),
    reducer(payload, state) {
      return { ...state, emailVerification: payload };
    },
  }),
  UserEmailVerificationFulfilled: define({
    schema: z.null(),
    reducer(_, state) {
      return { ...state, emailVerification: null };
    },
  }),
}));

const commands = ESCF.aggregate.commands(state, events, (define) => ({
  CreateUser: define({
    schema: z.object({ password: z.string() }).and(userSchema),
    handler(payload, state) {
      if (state !== null) throw new Error("Already created");
      const emailVerification: UserEmailVerification = {
        oldEmail: null,
        newEmail: payload.email,
        token: nanoid(),
        expiresAt: null,
      };
      return [
        {
          type: "UserCreated",
          payload: {
            ...payload,
            deleted: false,
            passwordHash: payload.password,
            emailVerification,
          },
        },
        {
          type: "UserEmailVerificationIssued",
          payload: emailVerification,
        },
      ];
    },
  }),
  UpdateUser: define({
    schema: userSchema.partial(),
    handler(payload, state) {
      if (state === null) throw new Error("Not found");
      if (state.deleted) throw new Error("User Deleted");

      const updateEvent = {
        type: "UserUpdated",
        payload: { ...state, ...payload },
      } as const;

      if (payload.email && payload.email !== state.email) {
        return [
          updateEvent,
          {
            type: "UserEmailVerificationIssued",
            payload: {
              oldEmail: state.email,
              newEmail: payload.email,
              token: nanoid(),
              expiresAt: Date.now() + 1000 * 60 * 60,
            },
          },
        ];
      }
      return updateEvent;
    },
  }),
  DeleteUser: define({
    schema: z.null(),
    handler(_, state) {
      if (state === null) throw new Error("Not found");
      if (state.deleted) throw new Error("User Deleted");

      return {
        type: "UserDeleted",
        payload: null,
      };
    },
  }),
  Authenticate: define({
    schema: z.string(),
    handler(challengePassword, state) {
      if (state === null) throw new Error("Not found");
      if (state.deleted) throw new Error("User Deleted");

      if (state.passwordHash !== challengePassword) {
        throw new Error("Invalid password");
      }
      return {
        type: "UserAuthenticated",
        payload: null,
      };
    },
  }),
  FulfillEmailVerification: define({
    schema: z.object({ token: z.string() }),
    handler(payload, state) {
      if (state === null) throw new Error("Not found");
      if (state.deleted) throw new Error("User Deleted");

      if (state.emailVerification === null) {
        throw new Error("Already verified");
      }
      if (state.emailVerification.expiresAt) {
        if (Date.now() > state.emailVerification.expiresAt) {
          throw new Error("Expired");
        }
      }
      if (state.emailVerification.token !== payload.token) {
        throw new Error("Invalid token");
      }
      return {
        type: "UserEmailVerificationFulfilled",
        payload: null,
      };
    },
  }),
}));

export const UserAggregate = ESCF.aggregate({
  name: "User",
  state,
  commands,
  events,
});
```
system.ts (contained under the root worker's scope)
```ts
export const aggregates = ESCF.system.aggregates({
  user: UserAggregate,
});

export const models = ESCF.system.models((env: Env) => [
  {
    constructor: UserService,
    service: env.UserService,
    queue: env.UserServiceQueue,
  },
  {
    constructor: SessionService,
    service: env.SessionService,
    queue: env.SessionServiceQueue,
  },
]);

export const system = ESCF.system({
  aggregates,
  models,
});
```

process.ts (as its own worker)
```ts
export const SendEmailVerificationProcess = ESCF.process(aggregates, bindings, {
  name: "SendEmailVerificationProcess",
  eventHandlers: (effects) => ({
    async UserEmailVerificationIssued({ payload }) {
      await effects.sendEmailVerification(payload.newEmail, payload.token);
    },
  }),
  effects: () => ({
    async sendEmailVerification(email: string, token: string) {
      console.log("Sending email verification to %s: %s", email, token);
    },
  }),
});
```

service.ts (as its own worker)
```ts
const bindings = ESCF.bindings((env: Env) => ({
  db: new DrizzleD1Storage(env.DATABASE, { users, sessions }),
  getUsersProjection: () => system.getProjection(env, "users"),
  env,
}));

export default ESCF.projection(aggregates, bindings, {
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
  methods: ({ db, getUsersProjection }) => {
    const createSession = async (
      userObject: InferSelectModel<typeof users>
    ) => {
      const session = await db.insert(sessions).values({
        sessionId: nanoid(),
        userId: userObject.userId,
        expiresAt: createDate(sessionExpiresIn),
      });
      return new Session(userObject, session, true);
    };
    return {
      async register(input: User) {
        const { userId } = await getUsersProjection().register(input);
        const session = await createSession({ userId, ...input });
        return session;
      },
      async authenticate(email: string, password: string) {
        const { userId } = await getUsersProjection().authenticate(
          email,
          password
        );
        const user = await db
          .select()
          .from(users)
          .where(eq(users.userId, userId))
          .get();
        const session = await createSession(user);
        return session;
      },
      async getSession(sessionId: string) {
        const session = await db
          .select()
          .from(sessions)
          .where(eq(sessions.sessionId, sessionId))
          .get();
        if (!session) throw new Error("Invalid session");
        const user = await db
          .select()
          .from(users)
          .where(eq(users.userId, session.userId))
          .get();
        if (!user) throw new Error("Invalid session");
        return new Session(user, session, false);
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
```