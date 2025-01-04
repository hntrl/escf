import { aggregate } from "./aggregate";
import { bindings } from "./bindings";
import { eventStore } from "./store";
import { process } from "./process";
import { projection } from "./projection";
import { system } from "./system";

export const ESCF = {
  aggregate,
  bindings,
  eventStore,
  process,
  projection,
  system,
};

export * from "./aggregate";
export * from "./bindings";
export * from "./process";
export * from "./projection";
export * from "./rpc";
export * from "./store";
export * from "./system";
