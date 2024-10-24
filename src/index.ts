import { aggregate } from "./aggregate";
import { bindings } from "./bindings";
import { process } from "./process";
import { projection } from "./projection";
import { system } from "./system";

export const ESCF = {
  aggregate,
  bindings,
  process,
  projection,
  system,
};

export { RequestError, castRpcError } from "./rpc";
