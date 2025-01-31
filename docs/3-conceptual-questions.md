# AI's Conceptual Questions for Alignment

Below is a list of questions to clarify the design, implementation, and goals of this Reactive Architecture and Event Sourcing library on Cloudflare Workers. Please provide as much detail as you can to help ensure we share the same understanding.

---

## 1. Domain and Scope

1. What is the primary domain or problem space that this library aims to address?

Event-Driven Architecture and Event Sourcing (EDA/ES, Reactive Architecture) are conceptual patterns in backend designs that have been around for a while, but have largely been ignored by the broader development community. A common theme I notice is that the complexity of the patterns is often misunderstood by developers, and the benefits are not always clear. The wide adoption of the patterns is also hindered by the complexity of the most popular implementations, which are often heavyweight and require a lot of preliminary domain knowledge to implement. One could argue that the patterns are not as relevant in the modern era of cloud-native and serverless architectures, where the concept of a "server" is largely obsolete. However I believe the patterns are still relevant and can be a powerful tool for conceptualizing and building systems as it provides a natural way to think about the logic of a system (that even non-technical stakeholders can understand), and minimizes the thrash between the business and the technology.

I mentioned that the existing tooling hinders the adoption of the patterns as they also largely focus on the scalability and deployment of these principles on bare metal. This is why I like the novelty of Cloudflare Workers as it eliminates the scalability and deployment concerns as it is a capable serverless platform. The main intention of this library is to provide a lightweight and easy-to-understand implementation of the patterns that is also scalable and has the capability to ship fast.

1. Are there any domain-driven design considerations (e.g., bounded contexts) that we should be aware of?

The viability of this library hinders on it's ability to be domain-agnostic, and as such as the end-user developer DDD principles are hugely beneficial to understand. As for the actual inner workings of the framework, the intent is to bridge the gap between the domain model and the actual implementation on Cloudflare Workers. Because of the organizational and technical limitations that come with that, there is still some translation required to apply the conceptual domain model to an actual working system using this framework. Some key considerations with that in mind:

- The highest level of abstraction this library concerns itself with is the bounded context, meaning that this library is designed to be used as the deployment unit for a single bounded context. There is no intention to support multiple bounded contexts in a single deployment. It can be argued that this is a limitation, but I believe it is a necessary one as it allows for a more focused and cohesive approach to the design and implementation of the system.
  - If there becomes a need to support multiple bounded contexts, it should be done at the application level, not the framework level, which could be eased by a utility to create an event broker between bounded contexts (e.g. a message queue using worker entrypoints).
  - Since there is only one bounded context per deployment, it could also be considered that the vocabulary and definitions of the domain model should be scoped to the bounded context. This also means that each term is global to the bounded context and the implementation at large.
- There is a slight departure from the conceptual model of an aggregate in DDD from what an aggregate means here. In DDD, an aggregate is a cluster of domain objects that are bound together by a root entity, meaning that any domain rules or invariants (e.g. field uniqueness across aggregate entities) are enforced by the aggregate root. Under this framework, an aggregate is a single domain object that is the source of truth for its domain state, meaning that enforcing invariants across the aggregate is the responsibility of the service layer issuing commands to the aggregate.
  - This means that the primary responsibility of the aggregate is to act as a consistency boundary for it's own domain state, and the service layer is responsible for enforcing invariants across all aggregate instances. (TLDR, the aggregate is the source of truth for it's own domain state by emitting errors when invariants are violated, and the service layer is responsible for enforcing invariants across all aggregate instances.)
  - This might be subject to change in the future, but with the current implementation this is currently impossible for any compute unit to enforce invariants in the same fashion as an aggregate root.
  - It's also worth mentioning that the concepts of entities or value objects are not explicitly enforced in this library. In terms of aggregate state, it is the job of the developer to define the state of the aggregate and the invariants that should be enforced. Any associated value objects or entities are determined by the developer by defining additional fields on the state of the aggregate and enforced by the command handlers of the aggregate.
  - Aggregate state is defined by a schema object that is passed to the aggregate constructor, and is derived using a reducer pattern where each event emitted by the aggregate is applied to the state object.
  - When considering the related principle of CQRS, aggregates should be considered the "command side" of the pattern.
- All commands and events are defined at the aggregate level, meaning that the developer is responsible for defining the commands and events for each aggregate, there can't be any commands or events that are shared between aggregates, and there can't be any "orphaned" commands or events that are not associated with any aggregate.

This library adapts other related principles like CQRS and event driven architecture (i.e. using projections/read models to support queries and an effect layer to handle side effects in an async manner), but that is beyond the scope of this question.

---

## 2. Events and Event Store

1. How are events structured (fields, metadata, etc.)?

As mentioned above, events are defined at the aggregate level and have the following properties:

- `schema`: A Zod schema that defines the structure of the event payload.
- `reducer`: A function that takes the current state of the aggregate and the event payload, and will return the new state of the aggregate after the event has been applied.
- A type field is used to identify the event, but isn't explicitly referenced as a property of the event object. (for ease of readability this is derived from the key of the event definition in the aggregate event definitions object, where the value is the properties of the event object as detailed above)

Recorded events are structured as a record with the following fields:

- `aggregate`: A string that is used to identify the aggregate that the event belongs to.
- `aggregateId`: A string that is used to identify the specific instance of the aggregate that the event belongs to.
- `type`: A string that is used to identify the event, and is used to determine the event handler that should be used to handle the event.
- `payload`: An object that contains the data for the event, and is used to pass the data to the event handler. The type of the payload is determined by referencing the defined schema for the event type in the `type` field.
- `timestamp`: A number that represents the time the event was created, and is used to determine the order of events in the event store.

Additional metadata is currently not stored as apart of an event, but this could be added in the future if deemed necessary.

2. How do you envision versioning or evolving event definitions over time?

I envision that as apart of the definition of an event, there should be chronologically ordered "event lenses" that are intended to be used to interpret the event payload from one version of the event to the next. This means that all implementation logic for the event should be in compliance with the most current defined event schema, and the series of event lenses will be used to interpret the event payload from previous versions of the event so that it's compatible with the current event schema. For instance:

- Lens A: defines the original event schema (v0), the next event schema (v1), and the logic to interpret the event payload from the old schema to the new schema.
- Lens B: defines the event schema (v1), the next event schema (v2), and the logic to interpret the event payload from the old schema to the new schema.
- Lens C: defines the event schema (v2), the next event schema (v3), and the logic to interpret the event payload from the old schema to the new schema.

This means that the event schema (v0) is the original event schema, and the event schema (v3) is the current event schema.

- This doesn't exist, but I imagine a O(n) complexity problem cropping up for events that change often. Since this means we're not mutating the event payload but rather converting it N times, this could be a performance bottleneck if the event schema changes often. Other options could be considered.

https://sinusoid.es/misc/lager/lenses.pdf

3. What retention policies (if any) are expected for the event store?

The library does a lot of heavy lifting, but the event store is intentionally left up to the developer to implement through passing an interface through to the definition of the system. This supports the idea that the library wants to be technology agnostic (other than the worker environment), and the developer is free to choose whatever persistence pattern they see fit.

However, the library does provide a standard implementation of an event store that is built on top of D1. This implementation is intended to be used as a reference implementation, and the developer is free to implement their own event store if they so desire. It should be noted that the library provides both the interface and the implementation of the event store, so the developer can choose to implement their own event store or use the provided implementation.

---# The following is all conceptual and should not be considered for immediate implementation.

This provided implementation should be able to support configurable retention policies to manage storage costs and performance. D1 has a hard cap of 10GB of storage per database, so a path to archive old events to cold storage is an absolute requirement.

- By default, all events should be retained indefinitely as they represent the source of truth for the system state
- However, the library should support configurable retention policies:
  - Time-based retention (e.g. retain events for X days/months)
  - Storage-based retention (e.g. retain up to X GB of events)
  - Aggregate-based retention (e.g. retain last X events per aggregate)
  - Snapshot-based retention (e.g. retain events since last snapshot)

The retention policy should be configurable at the bounded context level and potentially overridable at the aggregate level if needed. When events are pruned based on the retention policy:

- The system must maintain enough events to rebuild the current state
- Snapshots should be created before pruning old events to preserve state
- Metadata about pruned events should be maintained (e.g. count, date ranges)
- The pruning process should be atomic and not impact system availability

The retention implementation would likely leverage D1's built-in capabilities for efficient pruning of old records while maintaining indexes and referential integrity.

---# End of conceptual section

1. Is there a maximum throughput or storage concern for the event store?

The event store implementation needs to carefully consider both throughput and storage limitations, particularly within the Cloudflare Workers environment. The library should provide configuration options and best practices documentation to help developers optimize for their specific throughput and storage requirements while staying within Cloudflare's platform constraints.

The one hard limit to consider is that D1 has a hard cap of 10GB of storage per database, so a path to archive old events to cold storage is an absolute requirement.

https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/d1/platform/limits/

## 3. Aggregates and State Management

1. Which aggregate patterns (if any) are being used to manage state?

The library uses a standard event-sourced aggregate pattern where aggregates are the primary unit of consistency and encapsulation. Each aggregate is responsible for maintaining its own state and enforcing its own business rules. The aggregate pattern implemented in the library leverages Durable Objects to provide strong consistency guarantees, with each aggregate instance maintaining its own state derived from its own emitted events. Commands are validated and processed by aggregates to produce events, which are then applied sequentially to update aggregate state through a reducer pattern. All state changes are atomic and transactional within an aggregate boundary. Aggregates should only consider events that are emitted by the aggregate itself, and should not consider events that are emitted by other aggregates.

The library provides a base aggregate implementation that handles command validation and processing, event application and state updates, concurrency control via Durable Object semantics, state persistence and rehydration, and event publishing. Aggregates are defined declaratively using a state schema that defines the shape of the aggregate's state, event definitions that specify how events modify state, and command definitions that specify validation and event generation logic.

This pattern ensures that business rules are enforced consistently, state changes are atomic and traceable, events serve as the source of truth, commands and events are strongly typed, and aggregates maintain consistency boundaries. The implementation is intentionally minimal while providing the core building blocks needed for event-sourced aggregates. Developers can extend this base pattern with additional functionality as needed for their specific use cases.

2. How do you handle snapshotting or rehydrating aggregates from historical events?

This library currently does not support snapshotting or rehydrating aggregates from historical events. The big assumption here is that since the aggregate's state is managed as apart of the durable object, the state is always consistent and won't be brittle. Rehydration is a planned feature for the future to accommodate freak events that could cause the aggregate to become inconsistent.

3. Are there concurrency or consistency requirements when multiple events modify the same aggregate?

Since aggregates are sectioned off in terms of compute space in the form of durable objects, there is no need for concurrency control. The durable object will handle concurrency control for the aggregate, and the aggregate will handle the consistency of the state.

---

## 4. Projections and Read Models

1. How should read models (projections) be built and maintained over time?

The actual implementation of a read model is up to the developer, and as such all manner of state persistence/ additional processing can be used. The high level pattern is that read models will consume events as they happen in the system, and the developer can choose to do with those events as they see fit in that unit. Presently there is no state that is maintained to support the read model as it allows for us to utilize the stateless and global nature of the worker environment. State may need to be associated with the read model in the future to support rebuilding, but this is TBD.

In terms of the interaction layer between the system and the read model, they are build and maintained using a combination of event sourcing and periodic manual rebuilds.

Event-Driven Updates:

- Projections should subscribe to relevant events from aggregates they depend on
- Each projection defines handlers for the events it cares about
- When events arrive, the projection updates its state accordingly (according to the developer's implementation)
- Updates should be idempotent to handle duplicate events

Maintenance and Consistency:

- Support for rebuilding projections from scratch using event history

The library should provide:

- Base projection classes/interfaces for common projection patterns
- Utilities for managing projection state and rebuilds
- Documentation on projection patterns and best practices
- Type-safe event handling with proper schema validation

2. Is there a recommended approach for rebuilding projections after significant changes to event schemas?

For changes to the event schema, the concept of event lenses will enforce that only one event schema is used in the implementation. This means that given the implementation of the event handler is always consistent with the current event schema, the read model won't need to be rebuilt. However proper documentation should be provided to the developer to ensure that they understand the implications of event schema changes and that they can largely lean on their implementatin of the read model to determine if they need to rebuild it.

3. Should partial or partial-on-demand projection updates be supported, and if so, how?

TBD

---

## 5. Reactive Architecture & Pub/Sub

1. Which reactive library or pattern do you prefer beyond RxJS (if any)?

I've heard good things about Akka in Scala land.

2. How does the pub/sub mechanism integrate with Cloudflare Workers' stateless model?

The pub/sub model is a little bit of a faux pas in the stateless model of Cloudflare Workers and by extension this library. By default there is not an external queue or message broker. Instead the library will propagate events to the appropriate event consumers as they are emitted by the aggregate in the same request/thread. This means that the out-of-the-box is synchronous in nature, but having the developer focus on purely the domain model and not the infrastructure is a good starting point. The intent is that more complex infrastracture patterns can be incrementally adopted as the system grows and the developer sees fit.

There's a couple of ways to implement a more asynchronous pub/sub model in terms of the request/thread:

- Provide an interface for an external queue or message broker to be used as a message queue (this is theoretically possible, but I'm not sure how it would be implemented).
- Leverage the worker `ctx.waitUntil` method to return a response to the client, and process the event in a background thread.
- Utilize Cloudflare's native pub/sub message queue capabilities where the system will emit events to a message queue, and an event consumer on the same worker will process the events in a different request. (meaning that the system worker will both consume and produce messages)

I also imagine there is some value in providing ways to address both the synchronous same thread model and the asynchronous pub/sub model, and choose the appropriate pattern based on the use case. (like a .execute & .executeSync method on the aggregate)

3. Are there any built-in backpressure or throttling algorithms you expect to implement?

TBD

---

## 6. Cloudflare Workers Integration

1. What are some of the expected performance constraints in a Worker environment (e.g., CPU time, memory limits)?

Each individual worker request is limited to 30 seconds of CPU time, and a memory limit of 128MB. The pre-emptive loading time for code is also limited to 400ms. It's also worth noting that cloudflare will try its best to eliminate circular references in terms of execution within the worker, but it does this by limiting the depth of sub requests that can be made and not by using any graph logic (this isn't documented anywhere, but I've confirmed it's true by testing).

https://developers.cloudflare.com/workers/platform/limits/

2. Are there any special caching strategies (e.g., using Cloudflare KV or caching API) we should prioritize?

This is up to the developer. The business logic is meant to be as close to the worker environment as possible which means the developer is free to use any of the worker's caching capabilities to their advantage. There shouldn't be any special caching strategies that the worker should utilize since the work that it is doing internally shouldn't warrant any caching.

3. Do we need to account for edge cases like cold starts or ephemeral compute contexts?

No.

---

## 7. Error Handling & Reliability

1. Which error-handling strategies do you envision (e.g., retries, dead-letter queues, or compensating actions)?

DLQ's and retries are natively supported by cloudflare's message queue, but this is largely TBD. I anticipate that these will be up to the developer's discretion.

2. How do you want to handle partial failures in reactive streams or event handlers?

TBD

3. What mechanisms do you prefer for logging and monitoring errors in production?

TBD, but I imagine that the developer will be able to leverage the worker's logging capabilities to their advantage and implement their own logging and monitoring strategies.

---

## 8. Security & Compliance

1. Are there any compliance requirements (e.g., data residency constraints) that might affect event storage?

This is up to the developer to implement, and should be made possible considering that the library stays largely unopinionated on how data is persisted (other than aggregate state). Cloudflare's serverless platform is inherently global which means we don't really have much say in the matter (citation needed).

2. Do we need special encryption or data masking strategies for sensitive event fields?

Again this is up to the developer to implement.

---

## 9. CQRS & Command Handling

1. How do you define and handle commands differently from events?

Both commands and events are defined at the aggregate level and have an enforced schema, but the submission of commands are not persisted. Instead the command handler is responsible for emitting the events that are persisted to the event store.

1. Do commands require any validation or business logic before they’re accepted?

Yes. This is handled (1) by a command zod schema that is defined at the aggregate level and validates that the command payload is valid before it is even processed, and (2) by a command handler that ensures that the effects of a command won't violate any invariants of the aggregate.

3. Is there a sealing mechanism for commands (e.g., once a command is executed, is it immediately considered final)?

Again command submissions are not persisted, so there is no need for a sealing mechanism.

---

## 10. Idempotency & Duplication

1. How do you handle duplicate event submissions?

TBD

2. Are there specific idempotency strategies or tokens required in the system?

TBD

---

## 11. Testing & Tooling

1. Are there particular testing frameworks or patterns you prefer (e.g., integration tests with Miniflare)?

Testing frameworks should be agnostic in terms of testing against an implemented domain model. As for the library, there needs to be some kind of unit testing to make sure that the logic is working as intended, as well as an end-to-end against real systems to test to make sure that the library is working as intended in a production environment and meets the appropriate performance and scalability requirements.

2. How do you test concurrency scenarios and event ordering?

TBD

3. Is there a recommended test data management or teardown approach for events?

TBD

---

## 12. Deployment & Operational Best Practices

1. What is your deployment strategy (e.g., continuous deployment, versioned releases)?

For the developer, it should be acceptable to deploy the system continuously without need for versioned releases. However this may come with some operational concerns that the developer should be aware of, like a big warning label that there is no measure to prevent state to be corrupted by a failed deployment (until there is a snapshotting feature).

2. How should updates to the Worker script be coordinated with any existing events or read models?

We are not modifying state for each deployment, but we should be able to interpret all known versions of state by way of event lenses, meaning that any forward-facing changes to the system should naturally be compatible with any old versions of state.

1. Do you have guidelines for zero-downtime deployments or rolling upgrades?

TBD

---

## 13. Future Extensions

1. Are there any planned features or extensions, such as data pipelines or analytics?

It would be interesting to expose a web interface to the system to allow for a more detailed look into the system's state and a way to interact with the system. Perhaps a standardized worker entrypoint gets added to the worker that will enable us to query all parts of the system, and a different worker gets set up with a web interface that is configured to use that entrypoint.

2. Should we design for multi-region considerations or other geo-replication scenarios?

Cloudflare's serverless platform is inherently global, so there is no need to design for multi-region considerations or other geo-replication scenarios.

---

Please fill in any details or clarifications that come to mind. Your answers will help guide the library’s development so it fully meets your expectations and seamlessly fits into your overall architecture.
