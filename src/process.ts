import { WorkerEntrypoint } from "cloudflare:workers";

import { BindingsProvider, ExtractBindings } from "./bindings";
import type { Env } from "./env";
import { SystemAggregateMap, SystemEvent } from "./system";

type ProcessSideEffect = (...args: any[]) => any;
type ProcessSideEffects = Record<string, ProcessSideEffect>;

type ProcessEventHandler<
  TAggregates extends SystemAggregateMap,
  TEventType extends SystemEvent<TAggregates>["type"]
> = (event: Extract<SystemEvent<TAggregates>, { type: TEventType }>) => void;

type ProcessEventHandlers<TAggregates extends SystemAggregateMap> = Partial<{
  [K in SystemEvent<TAggregates>["type"]]: ProcessEventHandler<TAggregates, K>;
}>;

abstract class ProcessBase<
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

export const process = <
  TAggregates extends SystemAggregateMap,
  TBindingsProvider extends BindingsProvider,
  TEventHandlers extends ProcessEventHandlers<TAggregates>,
  TEffects extends ProcessSideEffects
>(
  aggregates: TAggregates,
  bindingsProvider: TBindingsProvider,
  opts: {
    name: string;
    eventHandlers: (
      effects: TEffects,
      bindings: ExtractBindings<TBindingsProvider>
    ) => TEventHandlers;
    effects: (bindings: ExtractBindings<TBindingsProvider>) => TEffects;
  }
): Process<TAggregates, TEventHandlers, TEffects> => {
  class ProcessEntrypoint extends ProcessBase<
    TAggregates,
    ProcessEventHandlers<TAggregates>,
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
};
