import { WorkerEntrypoint } from "cloudflare:workers";

import { BindingsProvider, ExtractBindings } from "./bindings";
import type { Env } from "./env";
import { SystemAggregateMap, SystemEvent } from "./system";

export type ProcessSideEffect = (...args: any[]) => any | undefined;
export type ProcessSideEffects = Record<string, ProcessSideEffect>;
export type ProcessSideEffectsFactory<
  TBindingsProvider extends BindingsProvider,
  TEffects extends ProcessSideEffects
> = (bindings: ExtractBindings<TBindingsProvider>) => TEffects;

export type ProcessEventHandler<
  TAggregates extends SystemAggregateMap,
  TEventType extends SystemEvent<TAggregates>["type"]
> = (event: Extract<SystemEvent<TAggregates>, { type: TEventType }>) => void;

export type ProcessEventHandlers<TAggregates extends SystemAggregateMap> =
  Partial<{
    [K in SystemEvent<TAggregates>["type"]]: ProcessEventHandler<
      TAggregates,
      K
    >;
  }>;

export type ProcessEventHandlerFactory<
  TAggregates extends SystemAggregateMap,
  TEventHandlers extends ProcessEventHandlers<TAggregates>,
  TSideEffects extends ProcessSideEffects,
  TBindingsProvider extends BindingsProvider
> = (
  effects: TSideEffects,
  bindings: ExtractBindings<TBindingsProvider>
) => TEventHandlers;

export abstract class ProcessBase<
  TAggregates extends SystemAggregateMap,
  TEventHandlers extends ProcessEventHandlers<TAggregates>,
  TEffects extends ProcessSideEffects
> {
  constructor(
    protected env: Env,
    protected eventHandlers: TEventHandlers,
    protected effects: TEffects
  ) {}

  async queue(batch: MessageBatch<SystemEvent<TAggregates>>) {
    for (const event of batch.messages) {
      await this.onEvent(event.body);
    }
  }

  async onEvent(event: SystemEvent<TAggregates>) {
    const handler = this.eventHandlers[event.type as keyof TEventHandlers] as
      | ProcessEventHandler<TAggregates, typeof event.type>
      | undefined;
    if (handler) {
      await handler(
        event as Extract<SystemEvent<TAggregates>, { type: typeof event.type }>
      );
    }
  }
}

export interface Process<
  TAggregates extends SystemAggregateMap,
  TEventHandlers extends ProcessEventHandlers<TAggregates>,
  TEffects extends ProcessSideEffects
> extends ProcessBase<TAggregates, TEventHandlers, TEffects> {
  new (env: Env): ProcessBase<TAggregates, TEventHandlers, TEffects>;
}

export type EmptyProcess = Process<any, any, any>;

export const process = Object.assign(
  <
    TAggregates extends SystemAggregateMap,
    TBindingsProvider extends BindingsProvider,
    TEventHandlers extends ProcessEventHandlers<TAggregates>,
    TEffects extends ProcessSideEffects
  >(
    aggregates: TAggregates,
    bindingsProvider: TBindingsProvider,
    opts: {
      name: string;
      eventHandlers: ProcessEventHandlerFactory<
        TAggregates,
        TEventHandlers,
        TEffects,
        TBindingsProvider
      >;
      effects: ProcessSideEffectsFactory<TBindingsProvider, TEffects>;
    }
  ): Process<TAggregates, TEventHandlers, TEffects> => {
    class ProcessEntrypoint extends ProcessBase<
      TAggregates,
      TEventHandlers,
      TEffects
    > {
      constructor(env: Env) {
        const bindings = bindingsProvider(
          env
        ) as ExtractBindings<TBindingsProvider>;
        const effects = opts.effects(bindings);
        const eventHandlers = opts.eventHandlers(effects, bindings);
        super(env, eventHandlers, effects);
      }
    }
    Object.defineProperty(ProcessEntrypoint, "name", { value: opts.name });
    return ProcessEntrypoint as Process<TAggregates, TEventHandlers, TEffects>;
  },
  {
    eventHandlers: <
      TAggregates extends SystemAggregateMap,
      TBindingsProvider extends BindingsProvider,
      TEventHandlers extends ProcessEventHandlers<TAggregates>,
      TEffects extends ProcessSideEffects,
      TFactory = ProcessEventHandlerFactory<
        TAggregates,
        TEventHandlers,
        TEffects,
        TBindingsProvider
      >
    >(
      aggregates: TAggregates,
      bindingsProvider: TBindingsProvider,
      factory: TFactory
    ): TFactory => factory,
    effects: <
      TBindingsProvider extends BindingsProvider,
      TEffects extends ProcessSideEffects,
      TFactory = ProcessSideEffectsFactory<TBindingsProvider, TEffects>
    >(
      bindingsProvider: TBindingsProvider,
      factory: TFactory
    ): TFactory => factory,
  }
);
