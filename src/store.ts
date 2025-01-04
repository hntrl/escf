import { BindingsProvider, ExtractBindings } from "./bindings";
import { Env } from "./env";
import { SystemAggregateMap, SystemEvent } from "./system";

export interface EventQueryOptions {
  fromEventId?: string;
  limit?: number;
  aggregateId?: string;
}

export interface EventStoreMethods<TAggregates extends SystemAggregateMap> {
  addEvent(event: SystemEvent<TAggregates>): Promise<void>;
  getEvents(options?: EventQueryOptions): Promise<SystemEvent<TAggregates>[]>;
  getAggregateEvents(aggregateId: string): Promise<SystemEvent<TAggregates>[]>;
}

export type EventStoreInitializer<TAggregates extends SystemAggregateMap> = (
  env: Env
) => EventStoreMethods<TAggregates>;

export const eventStore = <
  TAggregates extends SystemAggregateMap,
  TBindingsProvider extends BindingsProvider,
  TMethods extends EventStoreMethods<TAggregates>
>(
  aggregates: TAggregates,
  bindingsProvider: TBindingsProvider,
  factory: (bindings: ExtractBindings<TBindingsProvider>) => TMethods
): EventStoreInitializer<TAggregates> => {
  return (env: Env) => {
    const bindings = bindingsProvider(
      env
    ) as ExtractBindings<TBindingsProvider>;
    return factory(bindings);
  };
};
