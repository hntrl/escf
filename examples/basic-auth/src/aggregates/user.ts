import { z } from "zod";

import { ESCF, RequestError } from "escf/src";

export const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});
export type User = z.infer<typeof userSchema>;

const state = ESCF.aggregate.state(
  userSchema.merge(
    z.object({
      deleted: z.boolean(),
      passwordHash: z.string(),
    })
  )
);

const events = ESCF.aggregate.events(state, (define) => ({
  UserCreated: define({
    schema: userSchema,
    reducer({ payload, state }) {
      return { ...state, ...payload, deleted: false };
    },
  }),
  UserUpdated: define({
    schema: userSchema,
    reducer({ payload, state }) {
      return { ...state, ...payload };
    },
  }),
  UserDeleted: define({
    schema: z.null(),
    reducer({ state }) {
      return { ...state, deleted: true };
    },
  }),
  UserAuthenticated: define({
    schema: z.null(),
    reducer({ state }) {
      return state;
    },
  }),
}));

const commands = ESCF.aggregate.commands(state, events, (define) => ({
  CreateUser: define({
    schema: z.object({ password: z.string() }).and(userSchema),
    handler(payload, state) {
      if (state !== null) throw new RequestError("Already created");
      return {
        type: "UserCreated",
        payload: {
          ...payload,
          deleted: false,
          passwordHash: payload.password,
        },
      };
    },
  }),
  UpdateUser: define({
    schema: userSchema.partial(),
    handler(payload, state) {
      if (state === null) throw new RequestError("Not found");
      if (state.deleted) throw new RequestError("User Deleted");

      return {
        type: "UserUpdated",
        payload: { ...state, ...payload },
      };
    },
  }),
  DeleteUser: define({
    schema: z.null(),
    handler(_, state) {
      if (state === null) throw new RequestError("Not found");
      if (state.deleted) throw new RequestError("User Deleted");

      return {
        type: "UserDeleted",
        payload: null,
      };
    },
  }),
  Authenticate: define({
    schema: z.string(),
    handler(challengePassword, state) {
      if (state === null) throw new RequestError("Not found");
      if (state.deleted) throw new RequestError("User Deleted");

      if (state.passwordHash !== challengePassword) {
        throw new RequestError("Invalid password");
      }
      return {
        type: "UserAuthenticated",
        payload: null,
      };
    },
  }),
}));

export const UserAggregate = ESCF.aggregate({
  name: "UserAggregate",
  state,
  commands,
  events,
});
