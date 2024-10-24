import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

import type { Env } from "./env";

type InferType<T> = T extends z.ZodTypeAny ? z.infer<T> : never;
type ArrayOrValue<T> = T | T[];

export type AggregateIdentifier = string;

type AggregateStateDef<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = TSchema;

// TODO: events & commands that are not built using their respective factories should have unknown schema types
// e.x. this should be the default:
//      UserCreated: { schema: z.object(...), reducer: (event: unknown, state: TState) => TState }
//      this should be the desired behavior:
//      UserCreated: define({ schema: z.object(...), reducer: (event: TSchema, state: TState) => TState })

type AggregateEventDef<
  TAggregateState extends z.ZodTypeAny,
  TSchema extends z.ZodTypeAny
> = {
  schema: TSchema;
  reducer: (
    event: InferType<TSchema>,
    state: InferType<TAggregateState>
  ) => InferType<TAggregateState>;
};

type NamedAggregateEventDefs<TAggregateState extends AggregateStateDef> =
  Record<string, AggregateEventDef<TAggregateState, z.ZodTypeAny>>;

type AggregateEventInput<
  TEventDefs extends NamedAggregateEventDefs<z.ZodTypeAny>
> = {
  [K in keyof TEventDefs]: {
    type: K extends string ? K : never;
    payload: InferType<TEventDefs[K]["schema"]>;
  };
}[keyof TEventDefs];

type AggregateEvent<TEventDefs extends NamedAggregateEventDefs<z.ZodTypeAny>> =
  AggregateEventInput<TEventDefs> & {
    timestamp: number;
    aggregate: string;
    aggregateId: string;
  };

type AggregateCommandDef<
  TAggregateState extends z.ZodTypeAny,
  TAggregateEventDefs extends NamedAggregateEventDefs<TAggregateState>,
  TSchema extends z.ZodTypeAny
> = {
  schema: TSchema;
  handler: (
    payload: InferType<TSchema>,
    state: InferType<TAggregateState> | null
  ) => ArrayOrValue<AggregateEventInput<TAggregateEventDefs>>;
};

type NamedAggregateCommandDefs<
  TAggregateState extends AggregateStateDef,
  TAggregateEventDefs extends NamedAggregateEventDefs<TAggregateState>
> = Record<
  string,
  AggregateCommandDef<TAggregateState, TAggregateEventDefs, z.ZodTypeAny>
>;

type AggregateCommand<
  TCommandDefs extends NamedAggregateCommandDefs<
    z.ZodTypeAny,
    NamedAggregateEventDefs<z.ZodTypeAny>
  >
> = {
  [K in keyof TCommandDefs]: {
    type: K extends string ? K : never;
    payload: InferType<TCommandDefs[K]["schema"]>;
  };
}[keyof TCommandDefs];

abstract class AggregateBase<
  TState extends AggregateStateDef,
  TEventDefs extends NamedAggregateEventDefs<TState>,
  TCommandDefs extends NamedAggregateCommandDefs<TState, TEventDefs>
> extends DurableObject {
  state: InferType<TState> | null = null;

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
    readonly name: string,
    readonly eventDefinitions: TEventDefs,
    readonly commandDefinitions: TCommandDefs
  ) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const storage = await this.ctx.storage.get<InferType<TState>>("state");
      this.state = storage ?? null;
    });
  }

  async execute<K extends keyof TCommandDefs>(
    type: K,
    payload: InferType<TCommandDefs[K]["schema"]>
  ): Promise<Array<AggregateEvent<TEventDefs>>> {
    const command = this.commandDefinitions[type];
    if (!command) throw new Error(`Command ${String(type)} not found`);

    payload = command.schema.parse(payload);

    const eventOrEvents = await command.handler(payload, this.state);
    const events = Array.isArray(eventOrEvents)
      ? eventOrEvents
      : [eventOrEvents];

    for (const event of events) {
      const eventDefinition = this.eventDefinitions[event.type];
      if (!eventDefinition) continue;
      // TODO: {} as InferType<TState> is a hack to get this shipped. we need
      // to handle events from an uninitialized state, but introducing null to
      // the type is a breaking change
      this.state = eventDefinition.reducer(
        event.payload,
        this.state ?? ({} as InferType<TState>)
      );
    }
    await this.ctx.storage.put("state", this.state);

    return events.map((event) => ({
      timestamp: Date.now(),
      aggregate: this.name,
      aggregateId: this.ctx.id.toString(),
      ...event,
    }));
  }
}

export interface Aggregate<
  TState extends AggregateStateDef,
  TEventDefs extends NamedAggregateEventDefs<TState>,
  TCommandDefs extends NamedAggregateCommandDefs<TState, TEventDefs>
> extends AggregateBase<TState, TEventDefs, TCommandDefs> {
  new (ctx: DurableObjectState, env: Env): AggregateBase<
    TState,
    TEventDefs,
    TCommandDefs
  >;
}

export type EmptyAggregate = Aggregate<any, any, any>;

export type ExtractAggregateEvent<T> = T extends Aggregate<
  any,
  infer TEventDefs,
  any
>
  ? AggregateEvent<TEventDefs>
  : never;

export type ExtractAggregateCommand<T> = T extends Aggregate<
  any,
  any,
  infer TCommandDefs
>
  ? TCommandDefs extends NamedAggregateCommandDefs<any, any>
    ? AggregateCommand<TCommandDefs>
    : never
  : never;

export const aggregate = Object.assign(
  <
    TState extends AggregateStateDef,
    TEventDefs extends NamedAggregateEventDefs<TState>,
    TCommandDefs extends NamedAggregateCommandDefs<TState, TEventDefs>
  >(opts: {
    name: string;
    state: TState;
    events: TEventDefs;
    commands: TCommandDefs;
  }): Aggregate<TState, TEventDefs, TCommandDefs> => {
    class AggregateEntrypoint extends AggregateBase<
      TState,
      TEventDefs,
      TCommandDefs
    > {
      constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env, opts.name, opts.events, opts.commands);
      }
    }
    Object.defineProperty(AggregateEntrypoint, "name", { value: opts.name });
    return AggregateEntrypoint as Aggregate<TState, TEventDefs, TCommandDefs>;
  },
  {
    state: <TSchema extends z.ZodTypeAny>(schema: TSchema): TSchema => schema,
    events: <
      TAggregateState extends AggregateStateDef,
      TEventDefs extends NamedAggregateEventDefs<TAggregateState>
    >(
      state: TAggregateState,
      factory: (
        define: <TSchema extends z.ZodTypeAny>(
          def: AggregateEventDef<TAggregateState, TSchema>
        ) => AggregateEventDef<TAggregateState, TSchema>
      ) => TEventDefs
    ) => factory((d) => d),
    commands: <
      TAggregateState extends AggregateStateDef,
      TEventDefs extends NamedAggregateEventDefs<TAggregateState>,
      TCommandDefs extends NamedAggregateCommandDefs<
        TAggregateState,
        TEventDefs
      >
    >(
      state: TAggregateState,
      events: TEventDefs,
      factory: (
        define: <TSchema extends z.ZodTypeAny>(
          def: AggregateCommandDef<TAggregateState, TEventDefs, TSchema>
        ) => AggregateCommandDef<TAggregateState, TEventDefs, TSchema>
      ) => TCommandDefs
    ) => factory((d) => d),
  }
);
