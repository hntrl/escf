import { BindingsProvider, ExtractBindings } from "./bindings";
import type { Env } from "./env";
import { SystemAggregateMap, SystemEvent } from "./system";

export type ProjectionEventHandler<
  TAggregates extends SystemAggregateMap,
  TEventType extends SystemEvent<TAggregates>["type"]
> = (event: SystemEvent<TAggregates> & { type: TEventType }) => void;

export type ProjectionEventHandlers<TAggregates extends SystemAggregateMap> =
  Partial<{
    [K in SystemEvent<TAggregates>["type"]]: ProjectionEventHandler<
      TAggregates,
      K
    >;
  }>;

export type ProjectionEventHandlerFactory<
  TAggregates extends SystemAggregateMap,
  TEventHandlers extends ProjectionEventHandlers<TAggregates>,
  TBindingsProvider extends BindingsProvider
> = (bindings: ExtractBindings<TBindingsProvider>) => TEventHandlers;

export type ProjectionMethod = (...args: any[]) => any;
export type ProjectionMethods = Record<string, ProjectionMethod>;
export type ProjectionMethodFactory<
  TBindingsProvider extends BindingsProvider,
  TMethods extends ProjectionMethods
> = (bindings: ExtractBindings<TBindingsProvider>) => TMethods;

export abstract class ProjectionBase<
  TAggregates extends SystemAggregateMap,
  TEventHandlers extends ProjectionEventHandlers<TAggregates>,
  TMethods extends ProjectionMethods
> {
  constructor(
    protected env: Env,
    protected eventHandlers: TEventHandlers,
    public methods: TMethods
  ) {}

  public async queue(batch: MessageBatch<SystemEvent<TAggregates>>) {
    for (const event of batch.messages) {
      await this.onEvent(event.body);
    }
  }

  public async onEvent(event: SystemEvent<TAggregates>) {
    const handler = this.eventHandlers[event.type as keyof TEventHandlers] as
      | ProjectionEventHandler<TAggregates, typeof event.type>
      | undefined;
    if (handler) {
      await handler(
        event as Extract<SystemEvent<TAggregates>, { type: typeof event.type }>
      );
    }
  }
}

export interface Projection<
  TAggregates extends SystemAggregateMap,
  TEventHandlers extends ProjectionEventHandlers<TAggregates>,
  TMethods extends ProjectionMethods
> extends ProjectionBase<TAggregates, TEventHandlers, TMethods> {
  new (env: Env): ProjectionBase<TAggregates, TEventHandlers, TMethods>;
}

export type EmptyProjection = Projection<any, any, any>;

export type ExtractProjectionMethods<T> = T extends Projection<
  any,
  any,
  infer TMethods
>
  ? TMethods
  : never;

export const projection = Object.assign(
  <
    TAggregates extends SystemAggregateMap,
    TEventHandlers extends ProjectionEventHandlers<TAggregates>,
    TMethods extends ProjectionMethods,
    TBindingsProvider extends BindingsProvider
  >(
    aggregates: TAggregates,
    bindingsProvider: TBindingsProvider,
    opts: {
      name: string;
      eventHandlers: ProjectionEventHandlerFactory<
        TAggregates,
        TEventHandlers,
        TBindingsProvider
      >;
      methods: ProjectionMethodFactory<TBindingsProvider, TMethods>;
    }
  ): Projection<TAggregates, TEventHandlers, TMethods> => {
    class ProjectionEntrypoint extends ProjectionBase<
      TAggregates,
      TEventHandlers,
      TMethods
    > {
      constructor(env: Env) {
        const bindings = bindingsProvider(
          env
        ) as ExtractBindings<TBindingsProvider>;
        const eventHandlers = opts.eventHandlers(bindings);
        const methods = opts.methods(bindings);
        super(env, eventHandlers, methods);
      }
    }
    Object.defineProperty(ProjectionEntrypoint, "name", { value: opts.name });
    return ProjectionEntrypoint as Projection<
      TAggregates,
      TEventHandlers,
      TMethods
    >;
  },
  {
    eventHandlers: <
      TAggregates extends SystemAggregateMap,
      TBindingsProvider extends BindingsProvider,
      TEventHandlers extends ProjectionEventHandlers<TAggregates>,
      TFactory = ProjectionEventHandlerFactory<
        TAggregates,
        TEventHandlers,
        TBindingsProvider
      >
    >(
      aggregates: TAggregates,
      bindingsProvider: TBindingsProvider,
      factory: TFactory
    ): TFactory => factory,
    methods: <
      TBindingsProvider extends BindingsProvider,
      TMethods extends ProjectionMethods,
      TFactory = ProjectionMethodFactory<TBindingsProvider, TMethods>
    >(
      bindingsProvider: TBindingsProvider,
      factory: TFactory
    ): TFactory => factory,
  }
);
