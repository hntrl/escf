import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { ArrayOrValue, InferType, PromiseOrValue } from "./utils";
import { Env } from "./env";

type AggregateEventType = string;
type AggregateEventSchemas = Record<AggregateEventType, z.ZodTypeAny>;
type AggregateEventInput<TEventSchemas extends AggregateEventSchemas> = {
  [K in keyof TEventSchemas]: {
    type: K extends string ? K : never;
    payload: InferType<TEventSchemas[K]>;
  };
}[keyof TEventSchemas];
type AggregateEvent<TEventSchemas extends AggregateEventSchemas> =
  AggregateEventInput<TEventSchemas> & {
    timestamp: number;
    aggregate: string;
    aggregateId: AggregateIdentifier;
  };

type AggregateCommandType = string;
type AggregateCommandSchemas = Record<AggregateCommandType, z.ZodTypeAny>;
type AggregateCommand<TCommandSchemas extends AggregateCommandSchemas> = {
  [K in keyof TCommandSchemas]: {
    type: K extends string ? K : never;
    payload: InferType<TCommandSchemas[K]>;
  };
}[keyof TCommandSchemas];

async function validateCommandInput<
  TCommandSchemas extends AggregateCommandSchemas
>(
  type: keyof TCommandSchemas,
  payload: InferType<TCommandSchemas[keyof TCommandSchemas]>,
  schemas: TCommandSchemas
): Promise<InferType<TCommandSchemas[keyof TCommandSchemas]>> {
  const schema = schemas[type];
  if (!schema) throw new Error(`Command ${String(type)} not found`);
  const validation = schema.safeParse(payload);
  if (!validation.success) throw validation.error;
  return validation.data;
}

export type AggregateIdentifier = string;
export type EmptyAggregate = Aggregate<any, any>;

export interface Aggregate<
  TEventSchemas extends AggregateEventSchemas,
  TCommandSchemas extends AggregateCommandSchemas
> {
  readonly aggregateId: PromiseOrValue<AggregateIdentifier>;
  _receiveCommand<K extends keyof TCommandSchemas>(
    type: K,
    payload: InferType<TCommandSchemas[K]>
  ): Promise<Array<AggregateEvent<TEventSchemas>>>;
}

export interface AggregateGetter<T extends EmptyAggregate = EmptyAggregate> {
  _getAggregate(env: Env, aggregateId?: AggregateIdentifier): PromiseOrValue<T>;
}

export interface AggregateCtor<T extends EmptyAggregate = EmptyAggregate>
  extends AggregateGetter<T> {
  new (...args: any[]): T;
}

export type ExtractAggregate<T> = T extends AggregateGetter<infer TAggregate>
  ? TAggregate
  : T extends AggregateCtor<infer TAggregate>
  ? TAggregate
  : never;
export type ExtractAggregateEvent<
  T,
  TEventType extends ExtractAggregateEvent<T>["type"] | unknown = unknown
> = T extends AggregateObject<infer TEventSchemas, any>
  ? TEventType extends unknown
    ? AggregateEvent<TEventSchemas>
    : Extract<AggregateEvent<TEventSchemas>, { type: TEventType }>
  : never;
export type ExtractAggregateCommand<
  T,
  TCommandType extends ExtractAggregateCommand<T>["type"] | unknown = unknown
> = T extends AggregateObject<any, infer TCommandSchemas>
  ? TCommandType extends unknown
    ? AggregateCommand<TCommandSchemas>
    : Extract<AggregateCommand<TCommandSchemas>, { type: TCommandType }>
  : never;

export abstract class AggregateObject<
  TEventSchemas extends AggregateEventSchemas,
  TCommandSchemas extends AggregateCommandSchemas
> implements Aggregate<TEventSchemas, TCommandSchemas>
{
  constructor(
    readonly aggregateId: AggregateIdentifier,
    readonly eventSchemas: TEventSchemas,
    readonly commandSchemas: TCommandSchemas
  ) {}

  abstract execute<K extends keyof TCommandSchemas>(
    type: K,
    payload: InferType<TCommandSchemas[K]>
  ): Promise<Array<AggregateEvent<TEventSchemas>>>;

  public async _receiveCommand<K extends keyof TCommandSchemas>(
    type: K,
    payload: InferType<TCommandSchemas[K]>
  ): Promise<Array<AggregateEvent<TEventSchemas>>> {
    payload = await validateCommandInput(type, payload, this.commandSchemas);
    return this.execute(type, payload);
  }

  static _getAggregate(
    env: Env,
    aggregateId?: AggregateIdentifier
  ): Promise<Aggregate<any, any>> {
    throw new Error("AggregateObject must implement static _getAggregate().");
  }
}

export abstract class AggregateDurableObject<
    TEventSchemas extends AggregateEventSchemas,
    TCommandSchemas extends AggregateCommandSchemas
  >
  extends DurableObject
  implements Aggregate<TEventSchemas, TCommandSchemas>
{
  get aggregateId(): Promise<AggregateIdentifier> {
    return Promise.resolve(this.ctx.id.toString());
  }

  constructor(
    readonly ctx: DurableObjectState,
    readonly env: Env,
    readonly eventSchemas: TEventSchemas,
    readonly commandSchemas: TCommandSchemas
  ) {
    super(ctx, env);
  }

  abstract execute<K extends keyof TCommandSchemas>(
    type: K,
    payload: InferType<TCommandSchemas[K]>
  ): Promise<Array<AggregateEvent<TEventSchemas>>>;

  public async _receiveCommand<K extends keyof TCommandSchemas>(
    type: K,
    payload: InferType<TCommandSchemas[K]>
  ): Promise<Array<AggregateEvent<TEventSchemas>>> {
    payload = await validateCommandInput(type, payload, this.commandSchemas);
    return this.execute(type, payload);
  }

  static async _getAggregate(
    env: Env,
    aggregateId?: string
  ): Promise<Aggregate<any, any>> {
    const namespace = env[this.constructor.name] as DurableObjectNamespace<
      AggregateDurableObject<any, any>
    >;
    if (!namespace) {
      throw new Error(
        `Could not find durable object namespace for ${this.constructor.name}. Make sure that the binding name and aggregate name are the same in your wrangler.toml file. (i.e. { name = "ExampleAggregate", class_name = "ExampleAggregate" })`
      );
    }
    const stubId = namespace.idFromString(
      aggregateId ?? namespace.newUniqueId().toString()
    );
    const stub = namespace.get(stubId);
    // @ts-expect-error
    return stub;
  }
}

type BaseAggregateStateDef<TSchema extends z.ZodTypeAny = z.ZodTypeAny> =
  TSchema;

type BaseAggregateCommandDef<
  TAggregateState extends BaseAggregateStateDef,
  TEventDefs extends NamedBaseAggregateEventDefs<TAggregateState>,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny
> = {
  schema: TSchema;
  handler: (params: {
    payload: InferType<TSchema>;
    state: InferType<TAggregateState> | null;
  }) => PromiseOrValue<
    ArrayOrValue<
      AggregateEventInput<
        BaseAggregateEventSchemas<TAggregateState, TEventDefs>
      >
    >
  >;
};

const test = {} as BaseAggregateEventSchemas<
  any,
  any
> extends AggregateEventSchemas
  ? true
  : false;

type NamedBaseAggregateCommandDefs<
  TAggregateState extends BaseAggregateStateDef,
  TEventDefs extends NamedBaseAggregateEventDefs<TAggregateState>
> = Record<
  string,
  BaseAggregateCommandDef<TAggregateState, TEventDefs, z.ZodTypeAny>
>;

type BaseAggregateEventDef<
  TAggregateState extends BaseAggregateStateDef,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny
> = {
  schema: TSchema;
  reducer: (params: {
    payload: InferType<TSchema>;
    state: InferType<TAggregateState> | null;
    timestamp: number;
  }) => InferType<TAggregateState>;
};

export type BaseAggregateEventSchemas<
  TAggregateState extends BaseAggregateStateDef,
  TEventDefs extends NamedBaseAggregateEventDefs<TAggregateState>
> = {
  [K in keyof TEventDefs]: InferType<TEventDefs[K]["schema"]>;
}[keyof TEventDefs];

type NamedBaseAggregateEventDefs<
  TAggregateState extends BaseAggregateStateDef
> = Record<string, BaseAggregateEventDef<TAggregateState>>;

type BaseAggregateCommandSchemas<
  TAggregateState extends BaseAggregateStateDef,
  TCommandDefs extends NamedBaseAggregateCommandDefs<
    TAggregateState,
    NamedBaseAggregateEventDefs<TAggregateState>
  >
> = {
  [K in keyof TCommandDefs]: InferType<TCommandDefs[K]["schema"]>;
}[keyof TCommandDefs];

function BaseAggregate<
  TState extends BaseAggregateStateDef,
  TEventDefs extends NamedBaseAggregateEventDefs<TState>,
  TCommandDefs extends NamedBaseAggregateCommandDefs<TState, TEventDefs>
>(opts: {
  name: string;
  state: TState;
  events: TEventDefs;
  commands: TCommandDefs;
}): AggregateGetter<
  Aggregate<
    BaseAggregateEventSchemas<TState, TEventDefs>,
    BaseAggregateCommandSchemas<TState, TCommandDefs>
  >
> {
  type TEventSchemas = BaseAggregateEventSchemas<TState, TEventDefs>;
  const eventSchemas = Object.fromEntries(
    Object.entries(opts.events).map(([key, def]) => [key, def.schema])
  ) as TEventSchemas;
  type TCommandSchemas = BaseAggregateCommandSchemas<TState, TCommandDefs>;
  const commandSchemas = Object.fromEntries(
    Object.entries(opts.commands).map(([key, def]) => [key, def.schema])
  ) as TCommandSchemas;

  const entrypoint = class extends AggregateDurableObject<
    TEventSchemas,
    TCommandSchemas
  > {
    state: InferType<TState> | null = null;

    constructor(ctx: DurableObjectState, env: Env) {
      super(ctx, env, eventSchemas, commandSchemas);
      this.ctx.blockConcurrencyWhile(async () => {
        const storage = await this.ctx.storage.get<InferType<TState>>("state");
        this.state = storage ?? null;
      });
    }

    async execute<K extends keyof TCommandSchemas>(
      type: K,
      payload: InferType<TCommandSchemas[K]>
    ): Promise<Array<AggregateEvent<TEventSchemas>>> {
      const command = opts.commands[type as keyof TCommandDefs];
      if (!command) throw new Error(`Command ${String(type)} not found`);

      const eventOrEvents = await command.handler({
        payload,
        state: this.state,
      });
      const eventInputs = Array.isArray(eventOrEvents)
        ? eventOrEvents
        : [eventOrEvents];

      const events: AggregateEvent<TEventSchemas>[] = eventInputs.map(
        (event) => ({
          timestamp: Date.now(),
          aggregate: this.constructor.name,
          aggregateId: this.ctx.id.toString(),
          ...event,
        })
      );

      for (const event of events) {
        const eventDefinition = opts.events[event.type];
        if (!eventDefinition) continue;
        // TODO: {} as InferType<TState> is a hack to get this shipped. we need
        // to handle events from an uninitialized state, but introducing null to
        // the type is a breaking change
        const nextState = eventDefinition.reducer({
          payload: event.payload,
          state: this.state ?? ({} as InferType<TState>),
          timestamp: event.timestamp,
        });
        const validation = opts.state.safeParse(nextState);
        if (!validation.success) {
          throw validation.error;
        }
        this.state = validation.data;
      }
      await this.ctx.storage.put("state", this.state);

      return events;
    }
  };
  Object.defineProperty(entrypoint, "name", { value: opts.name });
  return entrypoint;
}

export const aggregate = Object.assign(BaseAggregate, {
  state: <TSchema extends z.ZodTypeAny>(schema: TSchema): TSchema => schema,
  events: <
    TAggregateState extends BaseAggregateStateDef,
    TEventDefs extends NamedBaseAggregateEventDefs<TAggregateState>
  >(
    state: TAggregateState,
    factory: (
      define: <TSchema extends z.ZodTypeAny>(
        def: BaseAggregateEventDef<TAggregateState, TSchema>
      ) => BaseAggregateEventDef<TAggregateState, TSchema>
    ) => TEventDefs
  ): TEventDefs => factory((d) => d),
  commands: <
    TAggregateState extends BaseAggregateStateDef,
    TEventDefs extends NamedBaseAggregateEventDefs<TAggregateState>,
    TCommandDefs extends NamedBaseAggregateCommandDefs<
      TAggregateState,
      TEventDefs
    >
  >(
    state: TAggregateState,
    events: TEventDefs,
    factory: (
      define: <TSchema extends z.ZodTypeAny>(
        def: BaseAggregateCommandDef<TAggregateState, TEventDefs, TSchema>
      ) => BaseAggregateCommandDef<TAggregateState, TEventDefs, TSchema>
    ) => TCommandDefs
  ): TCommandDefs => factory((d) => d),
});
