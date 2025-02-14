import {
  AggregateGetter,
  AggregateIdentifier,
  EmptyAggregate,
  ExtractAggregate,
  ExtractAggregateCommand,
  ExtractAggregateEvent,
  AggregateCtor,
} from "./aggregate";
import { Env } from "./env";
import { EmptyProjection, ExtractProjectionMethods } from "./projection";
import { EmptyProcess } from "./process";
import { EventStoreInitializer } from "./store";
import { iife } from "./utils";

export type SystemAggregateMap = Record<
  string,
  AggregateGetter | AggregateCtor
>;

export type SystemEvent<TAggregates extends SystemAggregateMap> =
  ExtractAggregateEvent<TAggregates[keyof TAggregates]>;

export interface ModelPrototype<TAggregates extends SystemAggregateMap> {
  queue(batch: MessageBatch<SystemEvent<TAggregates>>): void;
  onEvent(event: SystemEvent<TAggregates>): void;
}

export type SystemModelMap<
  TAggregates extends SystemAggregateMap,
  TModelPrototype extends ModelPrototype<TAggregates>
> = Record<string, TModelPrototype>;

export type SystemProjectionMap<TAggregates extends SystemAggregateMap> =
  SystemModelMap<TAggregates, EmptyProjection>;
export type SystemProcessMap<TAggregates extends SystemAggregateMap> =
  SystemModelMap<TAggregates, EmptyProcess>;

export type ExecuteAggregateCommandMethod<
  TAggregate extends EmptyAggregate,
  TAggregateCommand extends ExtractAggregateCommand<TAggregate> = ExtractAggregateCommand<TAggregate>
> = <T extends ExtractAggregateCommand<TAggregate>["type"]>(
  type: T,
  payload: Extract<TAggregateCommand, { type: T }>["payload"]
) => Promise<AggregateIdentifier>;

export interface AggregateInterface<TGetter extends AggregateGetter> {
  executeSync: ExecuteAggregateCommandMethod<ExtractAggregate<TGetter>>;
}

export type ProjectionInterface<TProjection extends EmptyProjection> =
  ExtractProjectionMethods<TProjection>;

export interface System<
  TAggregates extends SystemAggregateMap = SystemAggregateMap,
  TProjections extends SystemProjectionMap<TAggregates> = SystemProjectionMap<TAggregates>,
  TProcesses extends SystemProcessMap<TAggregates> = SystemProcessMap<TAggregates>
> {
  getAggregate<TAggregateKey extends keyof TAggregates>(
    env: Env,
    name: TAggregateKey,
    aggregateId?: AggregateIdentifier
  ): AggregateInterface<TAggregates[TAggregateKey]>;
  getProjection<TProjectionKey extends keyof TProjections>(
    env: Env,
    name: TProjectionKey
  ): ProjectionInterface<TProjections[TProjectionKey]>;
}

export const system = Object.assign(
  <
    TAggregates extends SystemAggregateMap,
    TProjections extends SystemProjectionMap<TAggregates>,
    TProcesses extends SystemProcessMap<TAggregates>
  >(opts: {
    aggregates: TAggregates;
    projections?: (env: Env) => TProjections;
    processes?: (env: Env) => TProcesses;
    eventStore?: EventStoreInitializer<TAggregates>;
  }): System<TAggregates, TProjections, TProcesses> => {
    return {
      getAggregate: <TAggregateKey extends keyof TAggregates>(
        env: Env,
        name: TAggregateKey,
        aggregateId?: AggregateIdentifier
      ): AggregateInterface<TAggregates[TAggregateKey]> => {
        const instance = iife(() => {
          const aggDef = opts.aggregates[name];
          if (
            "_getAggregate" in aggDef &&
            typeof aggDef._getAggregate === "function"
          ) {
            return aggDef._getAggregate(env, aggregateId) as ExtractAggregate<
              typeof aggDef
            >;
          }
          throw new Error(`Invalid aggregate signature for '${String(name)}'`);
        });

        const models = [
          ...(opts.projections ? Object.values(opts.projections(env)) : []),
          ...(opts.processes ? Object.values(opts.processes(env)) : []),
        ];

        const eventStore = opts.eventStore?.(env);

        const executeSync: ExecuteAggregateCommandMethod<
          ExtractAggregate<TAggregates[TAggregateKey]>
        > = async (type, payload) => {
          const events = await instance._receiveCommand(type, payload);

          if (eventStore) {
            for (const event of events) {
              await eventStore.addEvent(
                event as ExtractAggregateEvent<TAggregates[TAggregateKey]>
              );
            }
          }

          await Promise.all(
            models.map(async (model) => {
              const instance = new model(env);
              for (const event of events) {
                await instance.onEvent(event);
              }
            })
          );
          return instance.aggregateId;
        };
        return { executeSync };
      },
      getProjection: <TProjectionKey extends keyof TProjections>(
        env: Env,
        name: TProjectionKey
      ): ProjectionInterface<TProjections[TProjectionKey]> => {
        const projections = opts.projections?.(env);
        if (!projections) {
          throw new Error(
            `Could not find projections for '${name.toString()}' from the system definition, ensure it's configured correctly`
          );
        }
        const instance = new projections[name](env);
        return instance.methods;
      },
    };
  },
  {
    aggregates: <TAggregates extends SystemAggregateMap>(
      aggregates: TAggregates
    ): TAggregates => aggregates,
    projections: <
      TAggregates extends SystemAggregateMap,
      TProjections extends SystemProjectionMap<TAggregates>
    >(
      aggregates: TAggregates,
      factory: (env: Env) => TProjections
    ): ((env: Env) => TProjections) => factory,
    processes: <
      TAggregates extends SystemAggregateMap,
      TProcesses extends SystemProcessMap<TAggregates>
    >(
      aggregates: TAggregates,
      factory: (env: Env) => TProcesses
    ): ((env: Env) => TProcesses) => factory,
    eventStore: <TAggregates extends SystemAggregateMap>(
      aggregates: TAggregates,
      factory: EventStoreInitializer<TAggregates>
    ): EventStoreInitializer<TAggregates> => factory,
  }
);
